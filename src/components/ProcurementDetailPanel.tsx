import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, Modal } from 'react-native';
import { X, MoreVertical, Truck, Package, Paperclip, FileText, Image as ImageIcon, CheckCircle, XCircle, Send, PlusCircle, User, Calendar, Clock, ChevronRight } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useFyllStore, { type Procurement, formatCurrency } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useStatsColors } from '@/lib/theme';
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

const resolvePONumber = (procurement: Procurement): string => {
  const meta = extractMetadataValue(procurement.notes, 'po');
  if (meta) return meta.toUpperCase();
  return `PO-${procurement.id.slice(-4).toUpperCase().padStart(4, '0')}`;
};

const resolveStatus = (procurement: Procurement): string => {
  const meta = extractMetadataValue(procurement.notes, 'status');
  if (meta) return meta;
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

const SYSTEM_CHARGE_PRODUCT_IDS = new Set(['charge-transfer-fees', 'charge-stamp-duty']);
const isSystemChargeItem = (productId: string): boolean => SYSTEM_CHARGE_PRODUCT_IDS.has(productId);

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

// ── props ──

interface ProcurementDetailPanelProps {
  procurementId: string;
  compact?: boolean;
  statusOptions?: string[];
  onClose: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onMerge?: (id: string) => void;
  onStatusChange?: (id: string, status: string) => void;
}

export function ProcurementDetailPanel({ procurementId, compact = false, statusOptions = [], onClose, onEdit, onDelete, onMerge, onStatusChange }: ProcurementDetailPanelProps) {
  const colors = useStatsColors();
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const procurements = useFyllStore((s) => s.procurements);
  const products = useFyllStore((s) => s.products);
  const updateProcurement = useFyllStore((s) => s.updateProcurement);
  const [showActionMenu, setShowActionMenu] = useState<boolean>(false);
  const [showPoItemsModal, setShowPoItemsModal] = useState<boolean>(false);

  const procurement = useMemo(() => procurements.find((p) => p.id === procurementId) ?? null, [procurements, procurementId]);
  const poNumber = useMemo(() => procurement ? resolvePONumber(procurement) : '', [procurement]);
  const poName = useMemo(() => {
    const explicitTitle = procurement?.title?.trim();
    if (explicitTitle) return explicitTitle;
    const supplierName = procurement?.supplierName?.trim();
    if (supplierName) return supplierName;
    return 'Purchase Order';
  }, [procurement]);
  const status = useMemo(() => procurement ? resolveStatus(procurement) : '', [procurement]);
  const paidDate = useMemo(() => procurement ? resolvePaidDate(procurement) : '', [procurement]);
  const receivedDate = useMemo(() => procurement ? resolveReceivedDate(procurement) : '', [procurement]);
  const createdAt = useMemo(() => {
    if (!procurement) return '';
    const ts = new Date(procurement.createdAt).getTime();
    return isNaN(ts) ? '' : new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }, [procurement]);

  const statusColors = STATUS_COLORS[status.toLowerCase()] ?? { bg: 'rgba(0,0,0,0.07)', text: '#555555' };
  const visibleStatusOptions = statusOptions.length > 0 ? statusOptions : ['Draft', 'Sent', 'Confirmed', 'Received', 'Cancelled'];
  const heroPadding = compact ? 16 : 20;
  const heroAmountFontSize = compact ? 30 : 36;
  const heroAmountLineHeight = compact ? 36 : 42;
  const detailValueFontSize = compact ? 12 : 13;

  useEffect(() => {
    setShowActionMenu(false);
  }, [procurementId]);

  const itemRows = useMemo(() => {
    if (!procurement) return [];
    return procurement.items
    .filter((item) => !isSystemChargeItem(item.productId))
    .map((item, index) => {
      // Prefer stored names (set at creation time) over live lookup
      const storedName = item.productName;
      const storedVariant = item.variantName ?? '';

      const product = products.find((p) => p.id === item.productId);
      const variant = product?.variants.find((v) => v.id === item.variantId);
      const resolvedName = product?.name;
      const resolvedVariant = variant ? Object.values(variant.variableValues ?? {}).join(', ') : '';

      const fallbackName = item.productId.startsWith('charge-payment-') ? `Payment ${index + 1}` : `Line item ${index + 1}`;
      const name = storedName?.trim() || resolvedName?.trim() || fallbackName;
      const variantLabel = storedVariant || resolvedVariant;
      const quantityPurchased = item.quantity && item.quantity > 0 ? item.quantity : 0;
      const quantityReceived = item.quantityReceived && item.quantityReceived > 0 ? item.quantityReceived : quantityPurchased;

      return {
        id: `${item.productId}-${item.variantId}-${index}`,
        name: variantLabel ? `${name} — ${variantLabel}` : name,
        quantityPurchased,
        quantityReceived,
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
      if (!isSystemChargeItem(item.productId)) {
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
  const paymentBreakdownTotal = useMemo(
    () => paymentLineRows.reduce((sum, row) => sum + row.total, 0) + procurementChargeTotals.total,
    [paymentLineRows, procurementChargeTotals]
  );
  const nonChargeLineCount = useMemo(
    () => procurement?.items.filter((item) => !isSystemChargeItem(item.productId)).length ?? 0,
    [procurement]
  );

  const cleanNotes = useMemo(
    () => (procurement?.notes ?? '').replace(/\[([a-z_]+):([^\]]+)\]/gi, '').trim(),
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

  if (!procurement) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: colors.text.muted, fontSize: 15 }}>Purchase order not found</Text>
      </View>
    );
  }

  const getFileIcon = (mimeType?: string) => {
    if (!mimeType) return <FileText size={15} color={colors.text.tertiary} strokeWidth={1.5} />;
    if (mimeType.startsWith('image/')) return <ImageIcon size={15} color={colors.text.tertiary} strokeWidth={1.5} />;
    return <FileText size={15} color={colors.text.tertiary} strokeWidth={1.5} />;
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.screen }}>
      {showActionMenu ? (
        <Pressable
          onPress={() => setShowActionMenu(false)}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 30 }}
        />
      ) : null}
      {/* Panel header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          height: 56,
          borderBottomWidth: 1,
          borderBottomColor: colors.divider,
          backgroundColor: colors.bg.card,
          position: 'relative',
          zIndex: 40,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.input, borderWidth: 1, borderColor: colors.divider }}>
            <Truck size={15} color={colors.text.tertiary} strokeWidth={2} />
          </View>
          <Text style={{ color: colors.text.primary, fontSize: compact ? 15 : 16, fontWeight: '700' }}>PO Details</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ position: 'relative' }}>
            <Pressable
              onPress={() => setShowActionMenu((current) => !current)}
              style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.divider, backgroundColor: showActionMenu ? colors.bg.input : colors.bg.card }}
            >
              <MoreVertical size={16} color={colors.text.secondary} strokeWidth={2} />
            </Pressable>
            {showActionMenu ? (
              <View
                style={{
                  position: 'absolute',
                  top: 40,
                  right: 0,
                  minWidth: 162,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.divider,
                  backgroundColor: colors.bg.card,
                  overflow: 'hidden',
                  shadowColor: '#000000',
                  shadowOpacity: 0.12,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 6 },
                  zIndex: 60,
                }}
              >
                <Pressable
                  onPress={() => {
                    setShowActionMenu(false);
                    onEdit(procurementId);
                  }}
                  className="px-3 py-2.5"
                  style={{ borderBottomWidth: 1, borderBottomColor: colors.divider }}
                >
                  <Text style={{ color: colors.text.primary }} className="text-sm font-medium">Edit</Text>
                </Pressable>
                {onMerge ? (
                  <Pressable
                    onPress={() => {
                      setShowActionMenu(false);
                      onMerge(procurementId);
                    }}
                    className="px-3 py-2.5"
                    style={{ borderBottomWidth: 1, borderBottomColor: colors.divider }}
                  >
                    <Text style={{ color: colors.text.primary }} className="text-sm font-medium">Merge into another PO</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={() => {
                    setShowActionMenu(false);
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    onDelete(procurementId);
                  }}
                  className="px-3 py-2.5"
                >
                  <Text style={{ color: colors.danger }} className="text-sm font-medium">Delete</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={() => {
              setShowActionMenu(false);
              onClose();
            }}
            style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.input, borderWidth: 1, borderColor: colors.divider }}
          >
            <X size={16} color={colors.text.secondary} strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 12 }}>

        {/* Hero card */}
        <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.divider }}>
          <View style={{ padding: heroPadding, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: colors.text.muted, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                  Procurement
                </Text>
                <Text style={{ color: colors.text.primary, fontSize: compact ? 18 : 20, fontWeight: '600', lineHeight: compact ? 22 : 24 }} numberOfLines={2}>
                  {capitalizeDisplayValue(poName)}
                </Text>
                <Text style={{ color: colors.text.secondary, fontSize: compact ? 12 : 13, marginTop: 4 }} numberOfLines={1}>
                  {capitalizeDisplayValue(procurement.supplierName || 'No supplier')}
                </Text>
              </View>
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, backgroundColor: statusColors.bg }}>
                <Text style={{ color: statusColors.text, fontSize: 11, fontWeight: '600' }}>{capitalizeDisplayValue(status)}</Text>
              </View>
            </View>
            <Text style={{ color: colors.text.primary, fontSize: heroAmountFontSize, fontWeight: '500', lineHeight: heroAmountLineHeight }}>
              {formatCurrency(procurement.totalCost)}
            </Text>
            <Text style={{ color: colors.text.muted, fontSize: compact ? 12 : 13, fontWeight: '500', marginTop: 6 }}>
              {poNumber} · Paid on {paidDate}
            </Text>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Supplier</Text>
              <Text style={{ color: colors.text.primary, fontSize: compact ? 13 : 15, fontWeight: '600', marginTop: 3 }} numberOfLines={1}>
                {capitalizeDisplayValue(procurement.supplierName || 'No supplier')}
              </Text>
            </View>
            <View style={{ width: 1, backgroundColor: colors.divider }} />
            <View style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Line Items</Text>
              <Text style={{ color: colors.text.primary, fontSize: compact ? 13 : 15, fontWeight: '600', marginTop: 3 }}>
                {nonChargeLineCount > 0 ? nonChargeLineCount : procurement.items.length}
              </Text>
            </View>
          </View>
        </View>

        {/* Status */}
        <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.divider, padding: 16 }}>
          <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>Status</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {visibleStatusOptions.map((option) => {
              const optionColors = STATUS_COLORS[option.toLowerCase()] ?? { bg: colors.bg.input, text: colors.text.secondary };
              const isSelected = status.trim().toLowerCase() === option.trim().toLowerCase();
              return (
                <Pressable
                  key={option}
                  onPress={() => {
                    if (isSelected) return;
                    onStatusChange?.(procurement.id, option);
                    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
        <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.divider }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
            <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Details</Text>
          </View>
          {([
            { label: 'PO Name', value: poName, icon: <FileText size={compact ? 12 : 13} color={colors.text.tertiary} strokeWidth={2} /> },
            { label: 'Supplier', value: procurement.supplierName || '—', icon: <User size={compact ? 12 : 13} color={colors.text.tertiary} strokeWidth={2} /> },
            { label: 'Status', value: status, icon: <Truck size={compact ? 12 : 13} color={colors.text.tertiary} strokeWidth={2} /> },
            { label: 'Date Paid', value: paidDate || '—', icon: <Calendar size={compact ? 12 : 13} color={colors.text.tertiary} strokeWidth={2} /> },
            { label: 'Date Received', value: receivedDate || '—', icon: <Calendar size={compact ? 12 : 13} color={colors.text.tertiary} strokeWidth={2} /> },
            { label: 'Created', value: createdAt || '—', icon: <Clock size={compact ? 12 : 13} color={colors.text.tertiary} strokeWidth={2} /> },
          ] as const).map((row, index) => (
            <View
              key={row.label}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: compact ? 9 : 10,
                borderTopWidth: index === 0 ? 1 : 0,
                borderTopColor: colors.divider,
                gap: 10,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {row.icon}
                <Text style={{ color: colors.text.secondary, fontSize: compact ? 12 : 13 }}>{row.label}</Text>
              </View>
              <Text style={{ color: colors.text.primary, fontSize: compact ? 12 : detailValueFontSize, fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: 16 }}>
                {capitalizeDisplayValue(row.value)}
              </Text>
            </View>
          ))}
        </View>

        {/* PO Items (collapsed — opens a dedicated list) */}
        {poItemRows.length > 0 ? (
          <Pressable
            onPress={() => setShowPoItemsModal(true)}
            style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.divider }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}>
              <View>
                <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>PO Items</Text>
                <Text style={{ color: colors.text.primary, fontSize: compact ? 12 : 13, fontWeight: '600', marginTop: 4 }}>
                  {poItemRows.length} item{poItemRows.length === 1 ? '' : 's'}
                </Text>
              </View>
              <ChevronRight size={16} color={colors.text.tertiary} strokeWidth={2} />
            </View>
          </Pressable>
        ) : null}

        <Modal
          visible={showPoItemsModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowPoItemsModal(false)}
        >
          <Pressable
            onPress={() => setShowPoItemsModal(false)}
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}
          >
            <Pressable
              onPress={(event) => event.stopPropagation()}
              style={{
                maxHeight: '80%',
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                backgroundColor: colors.bg.card,
                overflow: 'hidden',
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
                <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '700' }}>PO Items</Text>
                <Pressable onPress={() => setShowPoItemsModal(false)} style={{ padding: 4 }}>
                  <X size={20} color={colors.text.secondary} strokeWidth={2.5} />
                </Pressable>
              </View>
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {poItemRows.map((item, index) => (
                  <View
                    key={item.id}
                    style={{
                      paddingHorizontal: 18,
                      paddingVertical: 12,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: colors.divider,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Package size={13} color={colors.text.tertiary} strokeWidth={2} />
                      <Text style={{ color: colors.text.secondary, fontSize: 13, flex: 1 }} numberOfLines={1}>
                        {capitalizeDisplayValue(item.name)}
                      </Text>
                    </View>
                    {item.quantityPurchased > 0 ? (
                      <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 4, marginLeft: 19 }}>
                        Qty {item.quantityPurchased}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Payment Breakdown */}
        {paymentLineRows.length > 0 ? (
          <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.divider }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>
              <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Payment Breakdown</Text>
            </View>
            {paymentLineRows.map((item, index) => (
              <View
                key={item.id}
                style={{
                  paddingHorizontal: 16,
                  paddingVertical: compact ? 9 : 10,
                  borderTopWidth: index === 0 ? 1 : 0,
                  borderTopColor: colors.divider,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, paddingRight: 12 }}>
                    <Package size={compact ? 12 : 13} color={colors.text.tertiary} strokeWidth={2} />
                    <Text style={{ color: colors.text.secondary, fontSize: compact ? 12 : 13 }} numberOfLines={1}>
                      {capitalizeDisplayValue(item.name)}
                    </Text>
                  </View>
                  <Text style={{ color: colors.text.primary, fontSize: compact ? 12 : detailValueFontSize, fontWeight: '600', textAlign: 'right' }}>
                    {formatCurrency(item.total)}
                  </Text>
                </View>
                {item.paymentDate ? (
                  <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 4, marginLeft: compact ? 18 : 19 }}>
                    Paid {item.paymentDate}
                  </Text>
                ) : null}
              </View>
            ))}
            {procurementChargeTotals.total > 0 ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 10, borderTopWidth: 1, borderTopColor: colors.divider }}>
                {procurementChargeTotals.transfer > 0 ? (
                  <View className="flex-row items-center justify-between">
                    <Text style={{ color: colors.text.muted, fontSize: compact ? 11 : 12 }}>
                      Transfer fees{procurementChargeTotals.count > 1 ? ` (${procurementChargeTotals.count}x)` : ''}
                    </Text>
                    <Text style={{ color: colors.text.secondary, fontSize: compact ? 12 : 13, fontWeight: '600' }}>
                      {formatCurrency(procurementChargeTotals.transfer)}
                    </Text>
                  </View>
                ) : null}
                {procurementChargeTotals.stampDuty > 0 ? (
                  <View className="flex-row items-center justify-between" style={{ marginTop: procurementChargeTotals.transfer > 0 ? 6 : 0 }}>
                    <Text style={{ color: colors.text.muted, fontSize: compact ? 11 : 12 }}>
                      Stamp duty{procurementChargeTotals.count > 1 ? ` (${procurementChargeTotals.count}x)` : ''}
                    </Text>
                    <Text style={{ color: colors.text.secondary, fontSize: compact ? 12 : 13, fontWeight: '600' }}>
                      {formatCurrency(procurementChargeTotals.stampDuty)}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, borderTopWidth: 1, borderTopColor: colors.divider }}>
              <Text style={{ color: colors.text.primary, fontSize: compact ? 12 : 13, fontWeight: '700' }}>Total Cost</Text>
              <Text style={{ color: colors.text.primary, fontSize: compact ? 14 : 15, fontWeight: '500' }}>{formatCurrency(paymentBreakdownTotal)}</Text>
            </View>
          </View>
        ) : null}

        {/* Attachments */}
        {(procurement.attachments?.length ?? 0) > 0 ? (
          <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.divider }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>
              <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Attachments</Text>
            </View>
            {procurement.attachments!.map((attachment, index) => (
              <Pressable
                key={`${attachment.storagePath ?? attachment.uri}-${index}`}
                onPress={() => {
                  void openAttachmentPath(attachment.storagePath ?? attachment.uri).catch(() => null);
                }}
                style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: index === 0 ? 1 : 0, borderTopColor: colors.divider, gap: 12 }}
              >
                <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg.input, borderWidth: 1, borderColor: colors.divider }}>
                  {getFileIcon(attachment.mimeType)}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text.primary, fontSize: detailValueFontSize, fontWeight: '600' }} numberOfLines={1}>{attachment.name}</Text>
                  {attachment.mimeType ? (
                    <Text style={{ color: colors.text.muted, fontSize: 11, marginTop: 1 }}>{attachment.mimeType}</Text>
                  ) : null}
                </View>
                <Paperclip size={14} color={colors.text.muted} strokeWidth={1.5} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Notes */}
        {cleanNotes ? (
          <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.divider, padding: 16 }}>
            <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Notes</Text>
            <Text style={{ color: colors.text.primary, fontSize: detailValueFontSize, lineHeight: compact ? 18 : 20 }}>{cleanNotes}</Text>
          </View>
        ) : null}

        {/* Activity thread */}
        {activityEvents.length > 0 ? (
          <View style={{ borderRadius: 16, overflow: 'hidden', backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.divider }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10 }}>
              <Text style={{ color: colors.text.muted, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>Activity</Text>
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
                <View key={index} style={{ flexDirection: 'row', paddingHorizontal: 16, paddingBottom: isLast ? 16 : 0 }}>
                  <View style={{ width: 32, alignItems: 'center', paddingTop: 2 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: dotBg, alignItems: 'center', justifyContent: 'center' }}>
                      <EventIcon size={13} color={dotColor} strokeWidth={2} />
                    </View>
                    {!isLast ? <View style={{ width: 1.5, flex: 1, backgroundColor: colors.divider, marginTop: 4 }} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingLeft: 10, paddingTop: 4, paddingBottom: isLast ? 0 : 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={{ color: colors.text.primary, fontSize: compact ? 11 : 12, fontWeight: '600', flex: 1 }}>{event.label}</Text>
                      {tsLabel ? <Text style={{ color: colors.text.muted, fontSize: 10 }}>{tsLabel}</Text> : null}
                    </View>
                    <Text style={{ color: colors.text.tertiary, fontSize: 10, marginTop: 2 }}>{event.actor}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}
