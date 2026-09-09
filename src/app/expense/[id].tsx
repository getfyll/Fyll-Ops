import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Platform, Modal } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Receipt, Pencil, Trash2, FileText, Download, MoreVertical, User, Tag, Calendar, Clock } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useFyllStore, { type Expense, type ExpenseRequestReceipt, formatCurrency } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useStatsColors } from '@/lib/theme';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { openAttachmentPath } from '@/lib/storage-attachments';

// ── helpers (duplicated from finance.tsx to keep this file self-contained) ──

type ExpenseType = 'one-time' | 'recurring';
const STAMP_DUTY_THRESHOLD = 10000;
const EXPENSE_BANK_CHARGE_LABEL = 'Bank Charges';
const EXPENSE_STAMP_DUTY_LABEL = 'Stamp Duty';

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

const normalizeBreakdownCategory = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : 'General';
};

const decodeMetadataJson = <T, >(value: string | null): T | null => {
  if (!value) return null;
  try { return JSON.parse(decodeURIComponent(value)) as T; } catch { return null; }
};

type LineItem = {
  id: string;
  label: string;
  amount: number;
  category: string;
  kind: 'base' | 'charge';
  source?: 'manual' | 'system';
};

const getTransferChargeBreakdown = ({
  baseAmount,
  applyCharges,
  tiers,
  vatRate,
  stampDutyAmount,
}: {
  baseAmount: number;
  applyCharges: boolean;
  tiers: { maxAmount: number | null; fixedFee: number }[];
  vatRate: number;
  stampDutyAmount: number;
}) => {
  if (!applyCharges || baseAmount <= 0) {
    return { fee: 0, vat: 0, stampDuty: 0, total: 0 };
  }
  const matchedTier = tiers.find((tier) => tier.maxAmount === null || baseAmount <= tier.maxAmount) ?? null;
  const fee = matchedTier?.fixedFee ?? 0;
  const vat = fee * vatRate;
  const stampDuty = baseAmount >= STAMP_DUTY_THRESHOLD ? stampDutyAmount : 0;
  return { fee, vat, stampDuty, total: fee + vat + stampDuty };
};

const parseExpenseApplyBankCharges = (description: string | undefined): boolean | null => {
  const raw = extractMetadataValue(description, 'apply_bank_charges')?.trim().toLowerCase();
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return null;
};

const isExpenseChargeLine = (line: LineItem): boolean => {
  if (line.source === 'system') return true;
  const normalizedLabel = line.label.trim().toLowerCase();
  return normalizedLabel === EXPENSE_BANK_CHARGE_LABEL.toLowerCase()
    || normalizedLabel === EXPENSE_STAMP_DUTY_LABEL.toLowerCase();
};

const parseLineItems = (description: string | undefined, fallbackCategory: string, fallbackAmount: number): LineItem[] => {
  const encoded = extractMetadataValue(description, 'line_items');
  const parsed = decodeMetadataJson<{ label?: string; amount?: number; category?: string; kind?: 'base' | 'charge'; source?: 'manual' | 'system' }[]>(encoded);
  if (parsed && parsed.length > 0) {
    const normalized = parsed.map((line, i) => ({
      id: `line-${i + 1}`,
      label: (line.label ?? '').trim() || (i === 0 ? 'Base Amount' : 'Additional Charge'),
      amount: Number.isFinite(Number(line.amount)) ? Number(line.amount) : 0,
      category: normalizeBreakdownCategory(line.category ?? fallbackCategory),
      kind: (line.kind === 'charge' ? 'charge' : (i === 0 ? 'base' : 'charge')) as 'base' | 'charge',
      source: line.source === 'system' ? 'system' as const : 'manual' as const,
    })).filter((l) => l.amount >= 0);
    if (normalized.length > 0) return normalized;
  }
  return [{
    id: 'line-base',
    label: 'Base Amount',
    amount: Number.isFinite(fallbackAmount) ? fallbackAmount : 0,
    category: normalizeBreakdownCategory(fallbackCategory),
    kind: 'base',
    source: 'manual',
  }];
};

const parseReceipts = (description: string | undefined): ExpenseRequestReceipt[] => {
  const encoded = extractMetadataValue(description, 'receipts');
  const parsed = decodeMetadataJson<{ id?: string; fileName?: string; storagePath?: string; mimeType?: string; fileSize?: number }[]>(encoded);
  if (parsed && parsed.length > 0) {
    return parsed.filter((r) => Boolean(r.storagePath)).map((r, i) => ({
      id: r.id || `receipt-${i + 1}`, fileName: r.fileName || `Receipt ${i + 1}`, storagePath: r.storagePath || '', mimeType: r.mimeType, fileSize: Number.isFinite(Number(r.fileSize)) ? Number(r.fileSize) : undefined,
    })).filter((r) => r.storagePath.length > 0);
  }
  const legacyPath = extractMetadataValue(description, 'receipt_path');
  if (!legacyPath) return [];
  return [{ id: 'receipt-legacy', fileName: extractMetadataValue(description, 'receipt_name') || 'Receipt', storagePath: legacyPath }];
};

const inferExpenseType = (expense: Expense): ExpenseType => {
  const metaType = extractMetadataValue(expense.description, 'type')?.toLowerCase();
  if (metaType === 'one-time') return 'one-time';
  if (metaType === 'recurring' || metaType === 'fixed') return 'recurring';
  const source = `${expense.category} ${expense.description}`.toLowerCase();
  if (/rent|salary|payroll|utility|insurance|lease/.test(source)) return 'recurring';
  if (/subscription|recurring|ads|marketing|internet|delivery|logistics/.test(source)) return 'recurring';
  return 'one-time';
};

const formatExpenseTypeLabel = (value: ExpenseType) => value === 'one-time' ? 'One-Time' : 'Recurring';

const capitalizeDisplayValue = (value: string): string => {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
};

// ── component ──

export default function ExpenseDetailScreen() {
  const router = useRouter();
  const colors = useStatsColors();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const { id } = useLocalSearchParams<{ id: string }>();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const expenses = useFyllStore((s) => s.expenses);
  const financeRules = useFyllStore((s) => s.financeRules);
  const deleteExpense = useFyllStore((s) => s.deleteExpense);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);

  const expense = useMemo(() => expenses.find((e) => e.id === id) ?? null, [expenses, id]);

  const expenseType = useMemo(() => expense ? inferExpenseType(expense) : 'one-time', [expense]);
  const merchant = useMemo(() => extractMetadataValue(expense?.description, 'merchant') ?? '', [expense]);
  const name = useMemo(() => expense ? (stripMetadata(expense.description) || expense.description) : '', [expense]);
  const date = useMemo(() => {
    if (!expense) return '';
    const ts = new Date(expense.date).getTime();
    return Number.isFinite(ts) ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : expense.date;
  }, [expense]);
  const createdAt = useMemo(() => {
    if (!expense?.createdAt) return '';
    const ts = new Date(expense.createdAt).getTime();
    return Number.isFinite(ts) ? new Date(ts).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  }, [expense]);
  const lineItems = useMemo(() => {
    if (!expense) return [];
    const parsedLineItems = parseLineItems(expense.description, expense.category || 'General', expense.amount);
    const hasDerivedChargeRows = parsedLineItems.some((line) => isExpenseChargeLine(line));
    if (hasDerivedChargeRows) return parsedLineItems;

    const applyBankCharges = parseExpenseApplyBankCharges(expense.description);
    if (applyBankCharges === false) return parsedLineItems;

    const baseLine = parsedLineItems.find((line) => line.kind === 'base') ?? parsedLineItems[0];
    const baseAmount = baseLine?.amount ?? 0;
    const transferCharges = getTransferChargeBreakdown({
      baseAmount,
      applyCharges: true,
      tiers: financeRules.bankChargeTiers,
      vatRate: financeRules.vatRate,
      stampDutyAmount: financeRules.incomingStampDuty ?? 50,
    });
    const parsedSubtotal = parsedLineItems.reduce((sum, line) => sum + line.amount, 0);
    const inferredTotal = parsedSubtotal + transferCharges.total;
    const shouldAppendDerivedCharges = applyBankCharges === true
      || Math.abs(inferredTotal - expense.amount) < 0.01;

    if (!shouldAppendDerivedCharges || transferCharges.total <= 0) return parsedLineItems;

    const derivedLines: LineItem[] = [];
    if (transferCharges.fee + transferCharges.vat > 0) {
      derivedLines.push({
        id: 'line-bank-charges',
        label: EXPENSE_BANK_CHARGE_LABEL,
        amount: transferCharges.fee + transferCharges.vat,
        category: baseLine?.category || expense.category || 'General',
        kind: 'charge',
        source: 'system',
      });
    }
    if (transferCharges.stampDuty > 0) {
      derivedLines.push({
        id: 'line-stamp-duty',
        label: EXPENSE_STAMP_DUTY_LABEL,
        amount: transferCharges.stampDuty,
        category: baseLine?.category || expense.category || 'General',
        kind: 'charge',
        source: 'system',
      });
    }
    return [...parsedLineItems, ...derivedLines];
  }, [expense, financeRules.bankChargeTiers, financeRules.incomingStampDuty, financeRules.vatRate]);
  const receipts = useMemo(() => parseReceipts(expense?.description), [expense]);
  const note = useMemo(() => extractMetadataValue(expense?.description, 'note') ?? '', [expense]);

  const handleOpenReceipt = async (storagePath: string) => {
    const path = storagePath.trim();
    if (!path) return;
    try {
      await openAttachmentPath(path, 60 * 10);
    } catch (err) {
      console.warn('Open receipt failed:', err);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleDelete = () => {
    if (!expense || !businessId) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    deleteExpense(expense.id, businessId);
    router.back();
  };

  const handleEdit = () => {
    if (!expense) return;
    router.replace(`/(tabs)/finance?section=expenses&editExpenseId=${encodeURIComponent(expense.id)}` as any);
  };

  if (!expense) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: colors.bg.screen }}>
        <Text style={{ color: colors.text.muted }} className="text-base">Expense not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4 rounded-xl px-6 py-3" style={{ backgroundColor: colors.bg.input }}>
          <Text style={{ color: colors.text.primary }} className="font-semibold">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const typeBadgeColors = expenseType === 'recurring'
    ? { bg: 'rgba(139, 92, 246, 0.16)', text: '#8B5CF6' }
    : { bg: 'rgba(59, 130, 246, 0.16)', text: '#3B82F6' };
  const statusBadge = expense.status === 'draft'
    ? { label: 'Draft', bg: 'rgba(107,114,128,0.12)', text: '#6B7280' }
    : expense.status === 'partial'
      ? { label: 'Partial', bg: 'rgba(245,158,11,0.12)', text: '#F59E0B' }
      : expense.status === 'paid'
        ? { label: 'Paid', bg: 'rgba(16,185,129,0.12)', text: '#10B981' }
        : null;
  const expenseHeroCard = (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
      <View style={{ padding: isWebDesktop ? 24 : 20, borderBottomWidth: 1, borderBottomColor: colors.divider }}>
        <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider mb-1">Expense</Text>
            <Text style={{ color: colors.text.primary, fontSize: isWebDesktop ? 22 : 20, lineHeight: isWebDesktop ? 28 : 26 }} className="font-semibold" numberOfLines={2}>
              {capitalizeDisplayValue(name || expense.category || 'Expense')}
            </Text>
            <Text style={{ color: colors.text.secondary, fontSize: isWebDesktop ? 14 : 13, marginTop: 4 }} numberOfLines={1}>
              {capitalizeDisplayValue(merchant || expense.category || 'General')}
            </Text>
          </View>
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: typeBadgeColors.bg }}>
            <Text style={{ color: typeBadgeColors.text, fontSize: 11, fontWeight: '600' }}>{formatExpenseTypeLabel(expenseType)}</Text>
          </View>
        </View>
        <Text style={{ color: colors.text.primary, fontSize: isWebDesktop ? 42 : 44, lineHeight: isWebDesktop ? 48 : 48, marginTop: 14 }} className="font-medium">
          {formatCurrency(expense.amount)}
        </Text>
        <View className="flex-row items-center flex-wrap" style={{ gap: 8, marginTop: 8 }}>
          <Text style={{ color: colors.text.secondary, fontSize: isWebDesktop ? 13 : 12 }}>Paid on {date}</Text>
          {statusBadge ? (
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: statusBadge.bg }}>
              <Text style={{ color: statusBadge.text, fontSize: 11, fontWeight: '600' }}>{statusBadge.label}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, paddingHorizontal: isWebDesktop ? 24 : 16, paddingVertical: isWebDesktop ? 16 : 14 }}>
          <Text style={{ color: colors.text.tertiary }} className="text-xs uppercase font-semibold">Merchant</Text>
          <Text style={{ color: colors.text.primary, fontSize: isWebDesktop ? 16 : 14, fontWeight: '600', marginTop: 4 }} numberOfLines={1}>
            {capitalizeDisplayValue(merchant || 'Not set')}
          </Text>
        </View>
        <View style={{ width: 1, backgroundColor: colors.divider }} />
        <View style={{ flex: 1, paddingHorizontal: isWebDesktop ? 24 : 16, paddingVertical: isWebDesktop ? 16 : 14 }}>
          <Text style={{ color: colors.text.tertiary }} className="text-xs uppercase font-semibold">Category</Text>
          <Text style={{ color: colors.text.primary, fontSize: isWebDesktop ? 16 : 14, fontWeight: '600', marginTop: 4 }} numberOfLines={1}>
            {capitalizeDisplayValue(expense.category || 'General')}
          </Text>
        </View>
      </View>
    </View>
  );
  const paymentBreakdownCard = (
    <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
      <View style={{ paddingHorizontal: isWebDesktop ? 24 : 16, paddingTop: isWebDesktop ? 16 : 16, paddingBottom: isWebDesktop ? 16 : 14 }}>
        <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider">Payment Breakdown</Text>
      </View>
      <View style={{ paddingHorizontal: isWebDesktop ? 24 : 16, paddingBottom: isWebDesktop ? 16 : 16 }}>
        {lineItems.map((line, i) => (
          <View
            key={line.id}
            className="flex-row items-center justify-between"
            style={{
              paddingVertical: isWebDesktop ? 10 : 8,
              borderBottomWidth: i === lineItems.length - 1 ? 0 : 1,
              borderBottomColor: colors.divider,
            }}
          >
            <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              <Text numberOfLines={1} style={{ color: i === 0 ? colors.text.primary : colors.text.secondary }} className="text-sm font-medium">{line.label}</Text>
              <Text numberOfLines={1} style={{ color: colors.text.muted, fontSize: 12, marginTop: 2 }}>{capitalizeDisplayValue(line.category)}</Text>
            </View>
            <Text style={{ color: colors.text.primary, fontSize: isWebDesktop ? 15 : 14 }} className="font-semibold">{formatCurrency(line.amount)}</Text>
          </View>
        ))}
        <View className="flex-row items-center justify-between mt-3 pt-3" style={{ borderTopWidth: isWebDesktop ? 2 : 1, borderTopColor: colors.divider }}>
          <Text style={{ color: colors.text.primary }} className="text-base font-bold">Total Logged</Text>
          <Text style={{ color: colors.text.primary, fontSize: isWebDesktop ? 18 : 16 }} className="font-medium">{formatCurrency(expense.amount)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: colors.bg.screen }}>
      {/* Delete confirmation modal */}
      <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
        <Pressable className="flex-1 items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={() => setShowDeleteConfirm(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ width: 300, borderRadius: 20, backgroundColor: colors.bg.card, borderWidth: 1, borderColor: colors.divider, padding: 24, alignItems: 'center' }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(239,68,68,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Trash2 size={22} color="#EF4444" strokeWidth={2} />
            </View>
            <Text style={{ color: colors.text.primary, fontSize: 17, fontWeight: '700', marginBottom: 6 }}>Delete Expense?</Text>
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
            <Text style={{ color: colors.text.primary }} className="text-lg font-bold">Expense Details</Text>
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

        {/* Content */}
        <ScrollView
          className="flex-1"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: isWebDesktop ? 20 : 16,
            paddingTop: isWebDesktop ? 20 : 16,
            paddingBottom: insets.bottom + 32,
          }}
        >
          {isWebDesktop ? (
            /* ── Desktop: Two-column layout ── */
            <View className="flex-row" style={{ gap: 16 }}>
              {/* Left Column (financials + evidence) */}
              <View style={{ flex: 2 }}>
                {expenseHeroCard}
                <View style={{ marginTop: 16 }}>
                  {paymentBreakdownCard}
                </View>

                {/* Receipts */}
                {receipts.length > 0 ? (
                  <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg.card, overflow: 'hidden', marginTop: 16 }}>
                    <View className="px-6 pt-4 pb-3">
                      <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider">Receipts & Evidence</Text>
                    </View>
                    {receipts.map((r) => (
                      <Pressable key={r.id} onPress={() => { void handleOpenReceipt(r.storagePath); }} className="flex-row items-center px-6 py-3" style={{ borderTopWidth: 1, borderTopColor: colors.divider }}>
                        <View className="rounded-xl items-center justify-center" style={{ width: 48, height: 48, backgroundColor: colors.bg.input, borderWidth: 1, borderColor: colors.divider }}>
                          <FileText size={20} color={colors.text.tertiary} strokeWidth={2} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                          <Text style={{ color: colors.text.primary }} className="text-sm font-semibold" numberOfLines={1}>{r.fileName}</Text>
                          <Text style={{ color: colors.text.muted }} className="text-xs mt-0.5">Click to view receipt</Text>
                        </View>
                        <Download size={18} color={colors.text.tertiary} strokeWidth={2} />
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              {/* Right Column (metadata) */}
              <View style={{ flex: 1 }}>
                <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg.card, padding: 20 }}>
                  <View className="mb-1">
                    <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider">Details</Text>
                  </View>
                  {[
                    { label: 'Supplier / Merchant', value: merchant || '-' },
                    { label: 'Primary Category', value: expense.category || 'General' },
                    { label: 'Expense Type', value: formatExpenseTypeLabel(expenseType) },
                    { label: 'Date', value: date || '-' },
                    { label: 'Created', value: createdAt || '-' },
                  ].map((row, index) => (
                    <View
                      key={row.label}
                      className="flex-row justify-between"
                      style={{
                        alignItems: 'flex-start',
                        gap: 12,
                        paddingTop: index === 0 ? 0 : 14,
                        marginTop: index === 0 ? 0 : 14,
                        borderTopWidth: index === 0 ? 0 : 1,
                        borderTopColor: colors.divider,
                      }}
                    >
                      <Text style={{ color: colors.text.secondary, fontSize: 14 }}>{row.label}</Text>
                      <Text
                        style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: 20 }}
                      >
                        {row.value}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Notes */}
                <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg.card, overflow: 'hidden', marginTop: 16 }}>
                  <View className="px-5 pt-4 pb-3">
                    <Text style={{ color: colors.text.tertiary }} className="text-xs font-semibold uppercase tracking-wider">Notes</Text>
                  </View>
                  <View className="px-5 pb-4">
                    <Text style={{ color: colors.text.primary, lineHeight: 22 }} className="text-sm">{note || 'No notes added.'}</Text>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            /* ── Mobile: Single-column layout ── */
            <View style={{ gap: 12 }}>
              {expenseHeroCard}
              {paymentBreakdownCard}

              {/* Metadata */}
              <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg.card, padding: 16 }}>
                <Text style={{ color: colors.text.tertiary }} className="text-xs uppercase font-semibold mb-3">Details</Text>
                {[
                  { label: 'Supplier / Merchant', value: merchant || '-', icon: <User size={13} color={colors.text.tertiary} strokeWidth={2} /> },
                  { label: 'Primary Category', value: expense.category || 'General', icon: <Tag size={13} color={colors.text.tertiary} strokeWidth={2} /> },
                  { label: 'Expense Type', value: formatExpenseTypeLabel(expenseType), icon: <Receipt size={13} color={colors.text.tertiary} strokeWidth={2} /> },
                  { label: 'Date', value: date || '-', icon: <Calendar size={13} color={colors.text.tertiary} strokeWidth={2} /> },
                  { label: 'Created', value: createdAt || '-', icon: <Clock size={13} color={colors.text.tertiary} strokeWidth={2} /> },
                ].map((row, index) => (
                  <View
                    key={row.label}
                    className="flex-row justify-between"
                    style={{
                      alignItems: 'flex-start',
                      gap: 10,
                      paddingTop: index === 0 ? 0 : 6,
                      marginTop: index === 0 ? 0 : 6,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      {row.icon}
                      <Text style={{ color: colors.text.secondary, fontSize: 12 }}>{row.label}</Text>
                    </View>
                    <Text
                      style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: 16 }}
                    >
                      {capitalizeDisplayValue(row.value)}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Notes */}
              {note ? (
                <View style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg.card, padding: 16 }}>
                  <Text style={{ color: colors.text.tertiary }} className="text-xs uppercase font-semibold mb-1">Notes</Text>
                  <Text style={{ color: colors.text.primary }} className="text-sm">{note}</Text>
                </View>
              ) : null}

              {/* Receipts */}
              {receipts.length > 0 ? (
                <View style={{ gap: 10 }}>
                  {receipts.map((r) => (
                    <Pressable key={r.id} onPress={() => { void handleOpenReceipt(r.storagePath); }} style={{ borderRadius: 16, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.bg.card, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}>
                      <View className="rounded-xl items-center justify-center" style={{ width: 42, height: 42, backgroundColor: colors.bg.input, borderWidth: 1, borderColor: colors.divider }}>
                        <Receipt size={18} color={colors.text.tertiary} strokeWidth={2} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                        <Text style={{ color: colors.text.primary }} className="text-base font-semibold" numberOfLines={1}>{r.fileName}</Text>
                        <Text style={{ color: colors.text.secondary }} className="text-sm" numberOfLines={1}>Tap to view receipt</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
