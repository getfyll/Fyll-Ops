import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { X, MoreVertical, Receipt, FileText, Download, User, Tag, Calendar, Clock, ChevronDown, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import useFyllStore, { type Expense, type ExpensePaymentStatus, type ExpenseRequestReceipt, formatCurrency } from '@/lib/state/fyll-store';
import useAuthStore from '@/lib/state/auth-store';
import { useStatsColors } from '@/lib/theme';
import { openAttachmentPath } from '@/lib/storage-attachments';
import { MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';
import { getExpenseActivity, getExpenseSubmitter } from '@/lib/expense-activity';

// ── helpers ──

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

const decodeMetadataJson = <T, >(value: string | null): T | null => {
  if (!value) return null;
  try { return JSON.parse(decodeURIComponent(value)) as T; } catch { return null; }
};

type ExpenseType = 'one-time' | 'recurring';
type LineItem = {
  id: string;
  label: string;
  amount: number;
  category: string;
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
  const parsed = decodeMetadataJson<{ label?: string; amount?: number; category?: string; kind?: string; source?: 'manual' | 'system' }[]>(encoded);
  if (parsed && parsed.length > 0) {
    const normalized = parsed.map((line, i) => ({
      id: `line-${i + 1}`,
      label: (line.label ?? '').trim() || (i === 0 ? 'Base Amount' : 'Additional Charge'),
      amount: Number.isFinite(Number(line.amount)) ? Number(line.amount) : 0,
      category: (line.category ?? fallbackCategory).trim() || fallbackCategory,
      source: line.source === 'system' ? 'system' as const : 'manual' as const,
    })).filter((l) => l.amount >= 0);
    if (normalized.length > 0) return normalized;
  }
  return [{
    id: 'line-base',
    label: 'Base Amount',
    amount: Number.isFinite(fallbackAmount) ? fallbackAmount : 0,
    category: fallbackCategory || 'General',
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

const capitalizeDisplayValue = (value: string): string => {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
};

// ── props ──

interface ExpenseDetailPanelProps {
  expenseId: string;
  compact?: boolean;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ExpenseDetailPanel({ expenseId, compact = false, onClose, onEdit, onDelete }: ExpenseDetailPanelProps) {
  const colors = useStatsColors();
  const palette = usePaymentsPalette();
  const expenses = useFyllStore((s) => s.expenses);
  const updateExpense = useFyllStore((s) => s.updateExpense);
  const financeRules = useFyllStore((s) => s.financeRules);
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const [showActionMenu, setShowActionMenu] = useState<boolean>(false);
  const [statusListOpen, setStatusListOpen] = useState<boolean>(false);

  const expense = useMemo(() => expenses.find((e) => e.id === expenseId) ?? null, [expenses, expenseId]);

  const expenseType = useMemo(() => expense ? inferExpenseType(expense) : 'one-time', [expense]);
  const merchant = useMemo(() => extractMetadataValue(expense?.description, 'merchant') ?? '', [expense]);
  const name = useMemo(() => expense ? (stripMetadata(expense.description) || expense.description) : '', [expense]);
  const date = useMemo(() => {
    if (!expense) return '';
    const ts = new Date(expense.date).getTime();
    return Number.isFinite(ts) ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : expense.date;
  }, [expense]);
  const createdAt = useMemo(() => {
    if (!expense) return '';
    const ts = new Date(expense.createdAt).getTime();
    return Number.isFinite(ts) ? new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  }, [expense]);
  const lineItems = useMemo(() => {
    if (!expense) return [];
    const parsedLineItems = parseLineItems(expense.description, expense.category || 'General', expense.amount);
    const hasDerivedChargeRows = parsedLineItems.some((line) => isExpenseChargeLine(line));
    if (hasDerivedChargeRows) return parsedLineItems;

    const applyBankCharges = parseExpenseApplyBankCharges(expense.description);
    if (applyBankCharges === false) return parsedLineItems;

    const baseLine = parsedLineItems[0];
    const transferCharges = getTransferChargeBreakdown({
      baseAmount: baseLine?.amount ?? 0,
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
        source: 'system',
      });
    }
    if (transferCharges.stampDuty > 0) {
      derivedLines.push({
        id: 'line-stamp-duty',
        label: EXPENSE_STAMP_DUTY_LABEL,
        amount: transferCharges.stampDuty,
        category: baseLine?.category || expense.category || 'General',
        source: 'system',
      });
    }
    return [...parsedLineItems, ...derivedLines];
  }, [expense, financeRules.bankChargeTiers, financeRules.incomingStampDuty, financeRules.vatRate]);
  const receipts = useMemo(() => parseReceipts(expense?.description), [expense]);
  const note = useMemo(() => extractMetadataValue(expense?.description, 'note') ?? '', [expense]);

  const expenseRequests = useFyllStore((s) => s.expenseRequests);
  const linkedRequest = useMemo(
    () => expenseRequests.find((r) => r.approvedExpenseId === expenseId) ?? null,
    [expenseRequests, expenseId],
  );

  // Same list the full expense page shows (src/lib/expense-activity.ts).
  const activity = useMemo(() => (expense ? getExpenseActivity(expense, linkedRequest) : []), [expense, linkedRequest]);
  const submittedBy = useMemo(() => (expense ? getExpenseSubmitter(expense, linkedRequest) : ''), [expense, linkedRequest]);

  const typeBadgeColors = expenseType === 'recurring'
    ? { bg: 'rgba(139, 92, 246, 0.16)', text: '#8B5CF6' }
    : { bg: 'rgba(59, 130, 246, 0.16)', text: '#3B82F6' };

  const STATUS_BADGE: Record<ExpensePaymentStatus, { label: string; bg: string; text: string }> = {
    draft:   { label: 'Draft',   bg: 'rgba(107,114,128,0.12)', text: '#6B7280' },
    partial: { label: 'Partial', bg: 'rgba(245,158,11,0.12)',  text: '#F59E0B' },
    paid:    { label: 'Paid',    bg: 'rgba(16,185,129,0.12)',  text: '#10B981' },
  };
  const statusOptions = Object.entries(STATUS_BADGE) as [ExpensePaymentStatus, { label: string; bg: string; text: string }][];
  const statusBadge = expense?.status ? STATUS_BADGE[expense.status] : null;
  const heroPadding = compact ? 16 : 20;
  const heroAmountFontSize = compact ? 30 : 36;
  const heroAmountLineHeight = compact ? 36 : 42;
  const detailValueFontSize = compact ? 12 : 13;

  useEffect(() => {
    setShowActionMenu(false);
    setStatusListOpen(false);
  }, [expenseId]);

  const handleOpenReceipt = async (storagePath: string) => {
    const path = storagePath.trim();
    if (!path) return;
    try {
      await openAttachmentPath(path, 60 * 10);
    } catch (err) {
      console.warn('Open receipt failed:', err);
    }
  };

  if (!expense) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: colors.text.muted, fontSize: 15 }}>Expense not found</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
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
          borderBottomColor: palette.border,
          backgroundColor: palette.card,
          position: 'relative',
          zIndex: 40,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill, borderWidth: 1, borderColor: palette.border }}>
            <Receipt size={15} color={palette.faint} strokeWidth={2} />
          </View>
          <Text style={{ color: palette.text, fontSize: compact ? 15 : 16, fontWeight: '700' }}>Expense Details</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ position: 'relative' }}>
            <Pressable
              onPress={() => setShowActionMenu((current) => !current)}
              style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: palette.border, backgroundColor: showActionMenu ? palette.softFill : palette.card }}
            >
              <MoreVertical size={16} color={palette.muted} strokeWidth={2} />
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
                  borderColor: palette.border,
                  backgroundColor: palette.card,
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
                    onEdit(expenseId);
                  }}
                  className="px-3 py-2.5"
                  style={{ borderBottomWidth: 1, borderBottomColor: palette.border }}
                >
                  <Text style={{ color: palette.text }} className="text-sm font-medium">Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    setShowActionMenu(false);
                    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    onDelete(expenseId);
                  }}
                  className="px-3 py-2.5"
                >
                  <Text style={{ color: palette.danger }} className="text-sm font-medium">Delete</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
          <Pressable
            onPress={() => {
              setShowActionMenu(false);
              onClose();
            }}
            style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.softFill, borderWidth: 1, borderColor: palette.border }}
          >
            <X size={16} color={palette.muted} strokeWidth={2.5} />
          </Pressable>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32, gap: 12 }}>

        {/* Hero card */}
        <View style={{ borderRadius: 26, overflow: 'hidden', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}>
          <View style={{ padding: heroPadding, borderBottomWidth: 1, borderBottomColor: palette.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 4 }}>
                  Expense
                </Text>
                <MoneyText style={{ color: palette.text, fontSize: 18, lineHeight: 24 }} numberOfLines={2}>
                  {capitalizeDisplayValue(name || expense.category || 'Expense')}
                </MoneyText>
                <Text style={{ color: palette.faint, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                  {capitalizeDisplayValue(merchant || expense.category || 'General')}
                </Text>
              </View>
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, backgroundColor: typeBadgeColors.bg }}>
                <Text style={{ color: typeBadgeColors.text, fontSize: 10, fontWeight: '700', letterSpacing: 0.55, textTransform: 'uppercase' }}>
                  {expenseType === 'one-time' ? 'One-Time' : 'Recurring'}
                </Text>
              </View>
            </View>
            <MoneyText style={{ color: palette.text, fontSize: compact ? 32 : 40, lineHeight: compact ? 38 : 46 }}>
              {formatCurrency(expense.amount)}
            </MoneyText>
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 8, gap: 8 }}>
              <Text style={{ color: palette.faint, fontSize: 12 }}>{date}</Text>
              {statusBadge ? (
                <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, backgroundColor: statusBadge.bg }}>
                  <Text style={{ color: statusBadge.text, fontSize: 10, fontWeight: '700', letterSpacing: 0.55, textTransform: 'uppercase' }}>{statusBadge.label}</Text>
                  </View>
              ) : null}
            </View>
          </View>
          <View style={{ flexDirection: 'row' }}>
            <View style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Merchant</Text>
              <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600', marginTop: 4 }} numberOfLines={1}>
                {capitalizeDisplayValue(merchant || 'Not set')}
              </Text>
            </View>
            <View style={{ width: 1, backgroundColor: palette.hairline }} />
            <View style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 14 }}>
              <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Category</Text>
              <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600', marginTop: 4 }} numberOfLines={1}>
                {capitalizeDisplayValue(expense.category || 'General')}
              </Text>
            </View>
          </View>
        </View>

        {/* Status */}
        <View style={{ borderRadius: 26, overflow: 'hidden', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: 16 }}>
          <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 10 }}>Status</Text>
          {(() => {
            // Same look as the status picker on an order: the current status in a tinted box, tap it to pick another.
            const currentLabel = statusBadge?.label ?? 'Not set';
            const currentColor = statusBadge?.text ?? palette.faint;
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
                    <Text style={{ color: currentColor, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{currentLabel}</Text>
                  </View>
                  <ChevronDown size={16} color={palette.textSoft} strokeWidth={2.4} />
                </Pressable>

                {statusListOpen ? (
                  <View style={{ padding: 6, borderRadius: 16, backgroundColor: palette.cardHover, borderWidth: 1, borderColor: palette.outline }}>
                    {statusOptions.map(([option, meta]) => {
                      const isSelected = expense.status === option;
                      return (
                        <Pressable
                          key={option}
                          onPress={() => {
                            setStatusListOpen(false);
                            if (isSelected) return;
                            updateExpense(expense.id, { status: option }, businessId);
                            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: meta.text }} />
                          <Text style={{ color: palette.text, fontSize: 14, fontWeight: isSelected ? '600' : '500', flex: 1 }}>{meta.label}</Text>
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

        {/* Payment breakdown */}
        <View style={{ borderRadius: 26, overflow: 'hidden', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 }}>
            <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Payment Breakdown</Text>
          </View>
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            {lineItems.map((line, index) => (
              <View
                key={line.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 8,
                  borderBottomWidth: index === lineItems.length - 1 ? 0 : 1,
                  borderBottomColor: palette.hairline,
                }}
              >
                <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                  <Text style={{ color: palette.text, fontSize: 12, fontWeight: '500' }} numberOfLines={1}>{line.label}</Text>
                  <Text style={{ color: palette.faint, fontSize: 10, marginTop: 2 }}>{capitalizeDisplayValue(line.category)}</Text>
                </View>
                <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }}>
                  {formatCurrency(line.amount)}
                </Text>
              </View>
            ))}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: palette.hairline }}>
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: '700' }}>Total Logged</Text>
              <MoneyText style={{ color: palette.text, fontSize: 16 }}>{formatCurrency(expense.amount)}</MoneyText>
            </View>
          </View>
        </View>

        {/* Metadata card */}
        <View style={{ borderRadius: 26, overflow: 'hidden', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
            <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Details</Text>
          </View>

          {[
            { label: 'Supplier / Merchant', value: merchant || '—', icon: <User size={compact ? 12 : 13} color={palette.faint} strokeWidth={2} /> },
            { label: 'Primary Category', value: expense.category || '—', icon: <Tag size={compact ? 12 : 13} color={palette.faint} strokeWidth={2} /> },
            { label: 'Expense Type', value: expenseType === 'one-time' ? 'One-Time' : 'Recurring', icon: <Receipt size={compact ? 12 : 13} color={palette.faint} strokeWidth={2} /> },
            { label: 'Submitted by', value: submittedBy || '—', icon: <User size={compact ? 12 : 13} color={palette.faint} strokeWidth={2} /> },
            { label: 'Date', value: date || '—', icon: <Calendar size={compact ? 12 : 13} color={palette.faint} strokeWidth={2} /> },
            { label: 'Created', value: createdAt || '—', icon: <Clock size={compact ? 12 : 13} color={palette.faint} strokeWidth={2} /> },
          ].map((row, index) => (
            <View
              key={row.label}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                paddingHorizontal: 16,
                paddingVertical: compact ? 9 : 10,
                borderTopWidth: index === 0 ? 1 : 0,
                borderTopColor: palette.border,
                gap: 10,
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
          <View style={{ borderRadius: 26, overflow: 'hidden', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, padding: 16 }}>
            <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 8 }}>Notes</Text>
            <Text style={{ color: palette.text, fontSize: 12, lineHeight: 18 }}>{note}</Text>
          </View>
        ) : null}

        {/* Receipts */}
        {receipts.length > 0 ? (
          <View style={{ borderRadius: 26, overflow: 'hidden', backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border }}>
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
              <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>Receipts & Evidence</Text>
            </View>
            {receipts.map((receipt, index) => (
              <Pressable
                key={receipt.id}
                onPress={() => { void handleOpenReceipt(receipt.storagePath); }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingHorizontal: 16,
                  paddingVertical: 10,
                  borderTopWidth: 1,
                  borderTopColor: palette.hairline,
                  gap: 12,
                }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
                  <FileText size={17} color={palette.faint} strokeWidth={2} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{receipt.fileName}</Text>
                  <Text style={{ color: palette.faint, fontSize: 10, marginTop: 2 }}>Tap to view</Text>
                </View>
                <Download size={16} color={palette.faint} strokeWidth={2} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Activity */}
        {activity.length > 0 ? (
          <View style={{ borderRadius: 26, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 }}>
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
                    {entry.detail ? <Text style={{ color: palette.muted, fontSize: 10, lineHeight: 15, marginTop: 4 }}>{entry.detail}</Text> : null}
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}
