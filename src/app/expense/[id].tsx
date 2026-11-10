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
import { MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { findExpenseRequest, getExpenseActivity, getExpenseSubmitter } from '@/lib/expense-activity';

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
  const palette = usePaymentsPalette();
  const insets = useSafeAreaInsets();
  const { isDesktop } = useBreakpoint();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const { id } = useLocalSearchParams<{ id: string }>();

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const expenses = useFyllStore((s) => s.expenses);
  const financeRules = useFyllStore((s) => s.financeRules);
  const deleteExpense = useFyllStore((s) => s.deleteExpense);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);

  const expenseRequests = useFyllStore((s) => s.expenseRequests);

  const expense = useMemo(() => expenses.find((e) => e.id === id) ?? null, [expenses, id]);
  // The request this expense came from (if a team member asked for it), for "Submitted by" and the Activity list.
  const expenseRequest = useMemo(() => (expense ? findExpenseRequest(expense, expenseRequests ?? []) : null), [expense, expenseRequests]);
  const submittedBy = useMemo(() => (expense ? getExpenseSubmitter(expense, expenseRequest) : ''), [expense, expenseRequest]);
  const activity = useMemo(() => (expense ? getExpenseActivity(expense, expenseRequest) : []), [expense, expenseRequest]);

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
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: palette.page }}>
        <Text style={{ color: palette.faint }} className="text-base">Expense not found</Text>
        <Pressable onPress={() => router.back()} className="mt-4 rounded-xl px-6 py-3" style={{ backgroundColor: palette.softFill }}>
          <Text style={{ color: palette.text }} className="font-semibold">Go Back</Text>
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
    <View style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, overflow: 'hidden' }}>
      <View style={{ padding: isWebDesktop ? 24 : 20, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
        <View className="flex-row items-start justify-between" style={{ gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 4 }}>Expense</Text>
            <MoneyText style={{ color: palette.text, fontSize: 18, lineHeight: 24 }} numberOfLines={2}>
              {capitalizeDisplayValue(name || expense.category || 'Expense')}
            </MoneyText>
            <Text style={{ color: palette.faint, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
              {capitalizeDisplayValue(merchant || expense.category || 'General')}
            </Text>
          </View>
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: typeBadgeColors.bg }}>
            <Text style={{ color: typeBadgeColors.text, fontSize: 10, fontWeight: '700', letterSpacing: 0.55, textTransform: 'uppercase' }}>{formatExpenseTypeLabel(expenseType)}</Text>
          </View>
        </View>
        <MoneyText style={{ color: palette.text, fontSize: isWebDesktop ? 40 : 32, lineHeight: isWebDesktop ? 46 : 38, marginTop: 14 }}>
          {formatCurrency(expense.amount)}
        </MoneyText>
        <View className="flex-row items-center flex-wrap" style={{ gap: 8, marginTop: 8 }}>
          <Text style={{ color: palette.faint, fontSize: 12 }}>Paid on {date}</Text>
          {statusBadge ? (
            <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: statusBadge.bg }}>
              <Text style={{ color: statusBadge.text, fontSize: 10, fontWeight: '700', letterSpacing: 0.55, textTransform: 'uppercase' }}>{statusBadge.label}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ flex: 1, paddingHorizontal: isWebDesktop ? 24 : 16, paddingVertical: isWebDesktop ? 16 : 14 }}>
          <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Merchant</Text>
          <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600', marginTop: 4 }} numberOfLines={1}>
            {capitalizeDisplayValue(merchant || 'Not set')}
          </Text>
        </View>
        <View style={{ width: 1, backgroundColor: palette.hairline }} />
        <View style={{ flex: 1, paddingHorizontal: isWebDesktop ? 24 : 16, paddingVertical: isWebDesktop ? 16 : 14 }}>
          <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Category</Text>
          <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600', marginTop: 4 }} numberOfLines={1}>
            {capitalizeDisplayValue(expense.category || 'General')}
          </Text>
        </View>
      </View>
    </View>
  );
  const paymentBreakdownCard = (
    <View style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, overflow: 'hidden' }}>
      <View style={{ paddingHorizontal: isWebDesktop ? 24 : 16, paddingTop: isWebDesktop ? 16 : 16, paddingBottom: isWebDesktop ? 16 : 14 }}>
        <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Payment Breakdown</Text>
      </View>
      <View style={{ paddingHorizontal: isWebDesktop ? 24 : 16, paddingBottom: isWebDesktop ? 16 : 16 }}>
        {lineItems.map((line, i) => (
          <View
            key={line.id}
            className="flex-row items-center justify-between"
            style={{
              paddingVertical: isWebDesktop ? 10 : 8,
              borderBottomWidth: i === lineItems.length - 1 ? 0 : 1,
              borderBottomColor: palette.hairline,
            }}
          >
            <View style={{ flex: 1, minWidth: 0, paddingRight: 12 }}>
              <Text numberOfLines={1} style={{ color: i === 0 ? palette.text : palette.muted, fontSize: 12, fontWeight: '500' }}>{line.label}</Text>
              <Text numberOfLines={1} style={{ color: palette.faint, fontSize: 10, marginTop: 2 }}>{capitalizeDisplayValue(line.category)}</Text>
            </View>
            <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }}>{formatCurrency(line.amount)}</Text>
          </View>
        ))}
        <View className="flex-row items-center justify-between mt-3 pt-3" style={{ borderTopWidth: 1, borderTopColor: palette.hairline }}>
          <Text style={{ color: palette.text, fontSize: 14, fontWeight: '700' }}>Total Logged</Text>
          <MoneyText style={{ color: palette.text, fontSize: 16 }}>{formatCurrency(expense.amount)}</MoneyText>
        </View>
      </View>
    </View>
  );

  const activityCard = activity.length > 0 ? (
    <View style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Activity</Text>
        <Text style={{ color: palette.faint, fontSize: 12 }}>{activity.length} {activity.length === 1 ? 'event' : 'events'}</Text>
      </View>
      <View style={{ gap: 14 }}>
        {activity.map((entry, index) => (
          <View key={`${entry.label}-${entry.at}-${index}`} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ alignItems: 'center' }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: index === 0 ? palette.limeOnSurface : palette.outline, marginTop: 4 }} />
              {index < activity.length - 1 ? (
                <View style={{ width: 1, flex: 1, backgroundColor: palette.hairline, marginTop: 6, minHeight: 28 }} />
              ) : null}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: palette.text, fontSize: 10, lineHeight: 15, fontWeight: '600' }}>{entry.label}</Text>
              <Text style={{ color: palette.faint, fontSize: 10, marginTop: 2 }}>
                {entry.actorName} · {new Date(entry.at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
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
            <MoneyText style={{ color: palette.text, fontSize: 18, marginBottom: 6 }}>Delete Expense?</MoneyText>
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
            <MoneyText style={{ color: palette.text, fontSize: 20, lineHeight: 26 }}>Expense Details</MoneyText>
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
                  <View style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, overflow: 'hidden', marginTop: 16 }}>
                    <View className="px-6 pt-4 pb-3">
                      <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Receipts & Evidence</Text>
                    </View>
                    {receipts.map((r) => (
                      <Pressable key={r.id} onPress={() => { void handleOpenReceipt(r.storagePath); }} className="flex-row items-center px-6 py-3" style={{ borderTopWidth: 1, borderTopColor: palette.hairline }}>
                        <View className="items-center justify-center" style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: palette.nudgeBg }}>
                          <FileText size={20} color={palette.faint} strokeWidth={2} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0, marginLeft: 12 }}>
                          <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{r.fileName}</Text>
                          <Text style={{ color: palette.faint, fontSize: 10, marginTop: 2 }}>Click to view receipt</Text>
                        </View>
                        <Download size={18} color={palette.faint} strokeWidth={2} />
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>

              {/* Right Column (metadata) */}
              <View style={{ flex: 1 }}>
                <View style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 20 }}>
                  <View className="mb-1">
                    <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Details</Text>
                  </View>
                  {[
                    { label: 'Supplier / Merchant', value: merchant || '-' },
                    { label: 'Primary Category', value: expense.category || 'General' },
                    { label: 'Expense Type', value: formatExpenseTypeLabel(expenseType) },
                    { label: 'Submitted by', value: submittedBy || '-' },
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
                        borderTopColor: palette.hairline,
                      }}
                    >
                      <Text style={{ color: palette.faint, fontSize: 12 }}>{row.label}</Text>
                      <Text
                        style={{ color: palette.text, fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: 20 }}
                      >
                        {row.value}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Notes */}
                <View style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, overflow: 'hidden', marginTop: 16 }}>
                  <View className="px-5 pt-4 pb-3">
                    <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Notes</Text>
                  </View>
                  <View className="px-5 pb-4">
                    <Text style={{ color: note ? palette.text : palette.faint, fontSize: 12, lineHeight: 18 }}>{note || 'No notes added.'}</Text>
                  </View>
                </View>

                {activityCard ? <View style={{ marginTop: 16 }}>{activityCard}</View> : null}
              </View>
            </View>
          ) : (
            /* ── Mobile: Single-column layout ── */
            <View style={{ gap: 12 }}>
              {expenseHeroCard}
              {paymentBreakdownCard}

              {/* Metadata */}
              <View style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 16 }}>
                <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 12 }}>Details</Text>
                {[
                  { label: 'Supplier / Merchant', value: merchant || '-', icon: <User size={13} color={palette.faint} strokeWidth={2} /> },
                  { label: 'Primary Category', value: expense.category || 'General', icon: <Tag size={13} color={palette.faint} strokeWidth={2} /> },
                  { label: 'Expense Type', value: formatExpenseTypeLabel(expenseType), icon: <Receipt size={13} color={palette.faint} strokeWidth={2} /> },
                  { label: 'Submitted by', value: submittedBy || '-', icon: <User size={13} color={palette.faint} strokeWidth={2} /> },
                  { label: 'Date', value: date || '-', icon: <Calendar size={13} color={palette.faint} strokeWidth={2} /> },
                  { label: 'Created', value: createdAt || '-', icon: <Clock size={13} color={palette.faint} strokeWidth={2} /> },
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
                      <Text style={{ color: palette.faint, fontSize: 12 }}>{row.label}</Text>
                    </View>
                    <Text
                      style={{ color: palette.text, fontSize: 12, fontWeight: '600', flex: 1, textAlign: 'right', marginLeft: 16 }}
                    >
                      {capitalizeDisplayValue(row.value)}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Notes */}
              {note ? (
                <View style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 16 }}>
                  <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 4 }}>Notes</Text>
                  <Text style={{ color: palette.text, fontSize: 12, lineHeight: 18 }}>{note}</Text>
                </View>
              ) : null}

              {/* Receipts */}
              {receipts.length > 0 ? (
                <View style={{ gap: 10 }}>
                  {receipts.map((r) => (
                    <Pressable key={r.id} onPress={() => { void handleOpenReceipt(r.storagePath); }} style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}>
                      <View className="items-center justify-center" style={{ width: 42, height: 42, borderRadius: 14, backgroundColor: palette.nudgeBg }}>
                        <Receipt size={18} color={palette.faint} strokeWidth={2} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0, marginLeft: 10 }}>
                        <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{r.fileName}</Text>
                        <Text style={{ color: palette.faint, fontSize: 10, marginTop: 2 }} numberOfLines={1}>Tap to view receipt</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {activityCard}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
