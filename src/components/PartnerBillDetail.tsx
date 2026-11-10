import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ArrowLeft, Calendar, Check, Glasses, MessageSquareWarning, Pencil, X } from 'lucide-react-native';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { formatCurrency, type PartnerBillStatus, type PartnerJob } from '@/lib/state/fyll-store';
import { useThemeColors } from '@/lib/theme';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, usePaymentsPalette } from '@/components/payments/payments-ui';

const BILL_STATUS_META: Record<PartnerBillStatus, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: 'rgba(180, 83, 9, 0.1)', text: '#B45309' },
  approved: { label: 'Approved', bg: '#E8F0FF', text: '#3B82F6' },
  rejected: { label: 'Rejected', bg: '#FEE9E9', text: '#DC2626' },
  queried: { label: 'Queried', bg: '#F3E8FF', text: '#7E22CE' },
  paid: { label: 'Paid', bg: '#E6F7EC', text: '#16A34A' },
};

const formatDate = (iso?: string | null) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatDateTime = (iso?: string | null) => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

// yyyy-mm-dd in the user's own timezone (toISOString would shift the day).
const toLocalDateInput = (date: Date) => {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};

const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'P';
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('');
};

// Bill review (details, jobs, activity and approve / reject / query / mark paid).
// Used as the full page on mobile and as the right-hand panel on the desktop
// Partners > Bills tab.
export function PartnerBillDetail({ billId, onClose, embedded = false }: {
  billId: string | undefined;
  onClose: () => void;
  embedded?: boolean;
}) {
  const colors = useThemeColors();
  const palette = usePaymentsPalette();
  const tabBarHeight = useTabBarHeight();
  const { businessName, companyName } = useBusinessSettings();
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const currentUserName = useAuthStore((s) => s.currentUser?.name ?? '');
  const partners = useFyllStore((s) => s.partners);
  const partnerJobs = useFyllStore((s) => s.partnerJobs);
  const orders = useFyllStore((s) => s.orders);
  const products = useFyllStore((s) => s.products);
  const updatePartnerJob = useFyllStore((s) => s.updatePartnerJob);

  const resolvedBillId = billId;
  const businessLabel = businessName.trim() || companyName.trim() || 'Business';
  const actorName = currentUserName || businessLabel;
  const partnerById = useMemo(() => new Map(partners.map((partner) => [partner.id, partner] as const)), [partners]);
  const orderById = useMemo(() => new Map(orders.map((order) => [order.id, order] as const)), [orders]);
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product] as const)), [products]);

  const getJobThumbnailUrl = (job: PartnerJob) => {
    if (job.imageUrl) return job.imageUrl;
    const order = job.orderId ? orderById.get(job.orderId) : null;
    const firstItem = order?.items?.[0];
    if (!firstItem) return null;
    const product = productById.get(firstItem.productId);
    const variantImage = product?.variants.find((variant) => variant.id === firstItem.variantId)?.imageUrl;
    return variantImage || product?.imageUrl || null;
  };

  const submittedBills = useMemo(() => {
    const byBillId = new Map<string, PartnerJob[]>();
    partnerJobs.forEach((job) => {
      if (!job.billId) return;
      const list = byBillId.get(job.billId) ?? [];
      list.push(job);
      byBillId.set(job.billId, list);
    });

    return Array.from(byBillId.entries())
      .map(([nextBillId, jobs]) => {
        const first = jobs[0];
        const partner = partnerById.get(first.partnerId);
        if (!partner) return null;
        return {
          billId: nextBillId,
          partner,
          jobs: jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
          jobIds: jobs.map((job) => job.id),
          jobCount: jobs.length,
          total: jobs.reduce((sum, job) => sum + (job.amount ?? 0), 0),
          status: first.billStatus ?? 'pending',
          submittedAt: first.billSubmittedAt ?? first.createdAt,
          respondedAt: first.billRespondedAt,
          respondedBy: first.billRespondedBy,
          note: first.billNote,
          paidAt: first.billPaidAt,
        };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b!.submittedAt).getTime() - new Date(a!.submittedAt).getTime()) as {
      billId: string;
      partner: NonNullable<ReturnType<typeof partnerById.get>>;
      jobs: PartnerJob[];
      jobIds: string[];
      jobCount: number;
      total: number;
      status: PartnerBillStatus;
      submittedAt: string;
      respondedAt?: string;
      respondedBy?: string;
      note?: string;
      paidAt?: string;
    }[];
  }, [partnerById, partnerJobs]);

  const bill = useMemo(
    () => submittedBills.find((entry) => entry.billId === resolvedBillId) ?? null,
    [resolvedBillId, submittedBills]
  );
  const statusMeta = bill ? BILL_STATUS_META[bill.status] : BILL_STATUS_META.pending;
  const [noteDraft, setNoteDraft] = useState('');
  // When the partner was actually paid; defaults to today, backdate if needed.
  const [paidDate, setPaidDate] = useState<Date>(() => new Date());
  const [showPaidDatePicker, setShowPaidDatePicker] = useState(false);
  const [editingPaidDate, setEditingPaidDate] = useState(false);
  const activityEntries = useMemo(() => {
    if (!bill) return [];
    const entries: { label: string; at: string; actor: string; tone: 'primary' | 'muted' }[] = [
      {
        label: 'Bill submitted',
        at: bill.submittedAt,
        actor: bill.partner.name,
        tone: 'primary',
      },
    ];

    if (bill.respondedAt) {
      const reviewedLabel = bill.status === 'approved'
        ? 'Bill approved'
        : bill.status === 'rejected'
          ? 'Bill rejected'
          : bill.status === 'queried'
            ? 'Query sent to partner'
            : 'Bill reviewed';
      entries.push({
        label: reviewedLabel,
        at: bill.respondedAt,
        actor: bill.respondedBy || businessLabel,
        tone: bill.status === 'rejected' ? 'primary' : 'muted',
      });
    }

    if (bill.paidAt) {
      entries.push({
        label: 'Bill paid',
        at: bill.paidAt,
        actor: bill.respondedBy || businessLabel,
        tone: 'muted',
      });
    }

    return entries
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .map((entry, index) => ({ ...entry, tone: index === 0 ? 'primary' : 'muted' as const }));
  }, [bill, businessLabel]);

  useEffect(() => {
    // Already paid: start on the recorded paid date so it can be corrected.
    const recorded = bill?.paidAt ? new Date(bill.paidAt) : null;
    setPaidDate(recorded && !Number.isNaN(recorded.getTime()) ? recorded : new Date());
    setShowPaidDatePicker(false);
    setEditingPaidDate(false);
  }, [bill?.billId, bill?.paidAt]);

  useEffect(() => {
    setNoteDraft(bill?.note ?? '');
  }, [bill?.billId, bill?.note]);

  const handleUpdateBillStatus = (status: PartnerBillStatus, note?: string, paidAt?: string) => {
    if (!bill) return;
    const timestamp = new Date().toISOString();
    bill.jobIds.forEach((jobId) => {
      updatePartnerJob(jobId, {
        billStatus: status,
        billRespondedAt: status === 'paid' ? bill.respondedAt : timestamp,
        billRespondedBy: status === 'paid' ? (bill.respondedBy ?? actorName) : actorName,
        billNote: note,
        billPaidAt: status === 'paid' ? (paidAt ?? timestamp) : undefined,
      }, businessId);
    });
  };

  const handleApprove = () => handleUpdateBillStatus('approved');
  const handleReject = () => handleUpdateBillStatus('rejected', noteDraft.trim() || undefined);
  const handleQuery = () => {
    const note = noteDraft.trim();
    if (!note) return;
    handleUpdateBillStatus('queried', note);
  };
  const toPaidAtIso = () => {
    // Today keeps the exact time; a backdated day is stored at midday so it
    // can't slip into the neighbouring day across timezones.
    const isToday = toLocalDateInput(paidDate) === toLocalDateInput(new Date());
    return isToday
      ? new Date().toISOString()
      : new Date(paidDate.getFullYear(), paidDate.getMonth(), paidDate.getDate(), 12, 0, 0).toISOString();
  };

  // Paid bill: only the paid date changes — status and review details stay.
  const handleUpdatePaidDate = () => {
    if (!bill) return;
    const paidAt = toPaidAtIso();
    bill.jobIds.forEach((jobId) => {
      updatePartnerJob(jobId, { billPaidAt: paidAt }, businessId);
    });
  };
  const paidDateChanged = Boolean(bill?.paidAt) && toLocalDateInput(paidDate) !== toLocalDateInput(new Date(bill!.paidAt!));

  const handleMarkPaid = () => {
    handleUpdateBillStatus('paid', undefined, toPaidAtIso());
  };

  if (!bill) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.page, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, justifyContent: 'center' }}>
        <View style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 20, alignItems: 'center' }}>
          <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Bill not found</Text>
          <Text style={{ color: palette.faint, fontSize: 12, marginTop: 6, textAlign: 'center' }}>
            This bill may have been removed or is no longer available in the current partner list.
          </Text>
          <Pressable
            onPress={onClose}
            style={{ marginTop: 16, height: 46, borderRadius: 999, backgroundColor: FYLL_LIME, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' }}
          >
            <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14 }}>{embedded ? 'Close' : 'Back to bills'}</MoneyText>
          </Pressable>
        </View>
      </View>
    );
  }

  const renderPaidDateField = (hint: string) => (
        <View>
          <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, marginBottom: 8 }}>
            Date paid
          </Text>
          {Platform.OS === 'web' ? (
            <View style={{ height: 48, borderRadius: 16, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.card, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }}>
              <input
                type="date"
                value={toLocalDateInput(paidDate)}
                max={toLocalDateInput(new Date())}
                onChange={(e) => {
                  if (!e.target.value) return;
                  const [year, month, day] = e.target.value.split('-').map(Number);
                  setPaidDate(new Date(year, month - 1, day, 12, 0, 0));
                }}
                style={{
                  width: '100%',
                  height: '100%',
                  fontSize: 14,
                  color: colors.text.primary,
                  backgroundColor: 'transparent',
                  border: 'none',
                  outline: 'none',
                  colorScheme: colors.bg.primary === '#111111' ? 'dark' : 'light',
                } as any}
              />
            </View>
          ) : (
            <Pressable
              onPress={() => setShowPaidDatePicker(true)}
              style={{ height: 48, borderRadius: 16, borderWidth: 1, borderColor: palette.outline, backgroundColor: palette.card, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Text style={{ color: palette.text, fontSize: 14 }}>
                {paidDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
              <Calendar size={16} color={colors.text.tertiary} strokeWidth={2} />
            </Pressable>
          )}
          <Text style={{ color: palette.faint, fontSize: 12, marginTop: 6 }}>
            {hint}
          </Text>
        </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          width: '100%',
          paddingHorizontal: embedded ? 18 : 20,
          paddingTop: embedded ? 18 : 16,
          paddingBottom: embedded ? 28 : tabBarHeight + 32,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {embedded ? null : (
            <Pressable
              onPress={onClose}
              style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}
            >
              <ArrowLeft size={18} color={palette.text} strokeWidth={2.2} />
            </Pressable>
          )}
          <MoneyText style={{ flex: 1, color: palette.text, fontSize: embedded ? 18 : 24, lineHeight: embedded ? 24 : 29 }}>Bill Details</MoneyText>
          {embedded ? (
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={16} color={palette.text} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }} numberOfLines={1}>
              {bill.partner.name}
            </Text>
            <View style={{ paddingHorizontal: 12, height: 32, borderRadius: 999, backgroundColor: statusMeta.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: statusMeta.text, fontSize: 10, fontWeight: '600' }}>{statusMeta.label}</Text>
            </View>
          </View>
          <MoneyText style={{ color: palette.text, fontSize: 30, lineHeight: 36, marginTop: 8 }}>
            {formatCurrency(bill.total)}
          </MoneyText>
          <Text style={{ color: palette.faint, fontSize: 12, marginTop: 4 }}>
            {bill.jobCount} {bill.jobCount === 1 ? 'job' : 'jobs'} · Submitted {formatDate(bill.submittedAt)}
          </Text>
        </View>

        <View style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>
              Details
            </Text>
            {bill.status === 'paid' ? (
              <Pressable
                onPress={() => setEditingPaidDate((current) => !current)}
                accessibilityLabel="Edit bill"
                hitSlop={8}
                style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: editingPaidDate ? FYLL_LIME : palette.softFill, alignItems: 'center', justifyContent: 'center' }}
              >
                <Pencil size={13} color={editingPaidDate ? FYLL_LIME_INK : palette.muted} strokeWidth={2.2} />
              </Pressable>
            ) : null}
          </View>
          {[
            { label: 'Partner', value: bill.partner.name },
            { label: 'Submitted', value: formatDate(bill.submittedAt) },
            { label: 'Status', value: statusMeta.label },
            ...(bill.respondedAt ? [{ label: 'Responded', value: formatDate(bill.respondedAt) }] : []),
            ...(bill.respondedBy ? [{ label: 'Handled by', value: bill.respondedBy }] : []),
            ...(bill.paidAt ? [{ label: 'Paid', value: formatDate(bill.paidAt) }] : []),
          ].map((row, index) => (
            <View
              key={row.label}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: palette.hairline }}
            >
              <Text style={{ color: palette.faint, fontSize: 12 }}>{row.label}</Text>
              <Text style={{ color: palette.text, fontSize: 12, fontWeight: '500', flexShrink: 1, textAlign: 'right' }}>{row.value}</Text>
            </View>
          ))}
          {bill.note ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: palette.hairline }}>
              <Text style={{ color: palette.faint, fontSize: 12, marginBottom: 4 }}>
                {bill.status === 'rejected' ? 'Rejection note' : bill.status === 'queried' ? 'Query note' : 'Note'}
              </Text>
              <Text style={{ color: palette.text, fontSize: 12, lineHeight: 18 }}>{bill.note}</Text>
            </View>
          ) : null}
        </View>

        {bill.status === 'pending' ? (
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={handleReject}
                style={{ flex: 1, height: 46, borderRadius: 999, backgroundColor: palette.dangerBg, borderWidth: 1, borderColor: palette.dangerBorder, alignItems: 'center', justifyContent: 'center' }}
              >
                <MoneyText style={{ color: palette.danger, fontSize: 14 }}>Reject</MoneyText>
              </Pressable>
              <Pressable
                onPress={handleApprove}
                style={{ flex: 1, height: 46, borderRadius: 999, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Check size={15} color={FYLL_LIME_INK} strokeWidth={2.4} />
                  <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14 }}>Approve</MoneyText>
                </View>
              </Pressable>
            </View>
            <View style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <MessageSquareWarning size={16} color={palette.limeOnSurface} strokeWidth={2} />
                <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Query partner</Text>
              </View>
              <TextInput
                value={noteDraft}
                onChangeText={setNoteDraft}
                placeholder="Type your query to the partner"
                placeholderTextColor={colors.input.placeholder}
                multiline
                style={{
                  minHeight: 88,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: palette.outline,
                  backgroundColor: palette.card,
                  color: palette.text,
                  fontSize: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                  textAlignVertical: 'top',
                }}
              />
              <Pressable
                onPress={handleQuery}
                disabled={!noteDraft.trim()}
                style={{
                  marginTop: 14,
                  alignSelf: 'flex-start',
                  minHeight: 38,
                  borderRadius: 999,
                  backgroundColor: noteDraft.trim() ? FYLL_LIME : palette.softFill,
                  paddingHorizontal: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MoneyText style={{ color: noteDraft.trim() ? FYLL_LIME_INK : palette.faint, fontSize: 14 }}>
                  Submit query
                </MoneyText>
              </Pressable>
            </View>
          </View>
        ) : bill.status === 'approved' ? (
          <View style={{ gap: 12, borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 16 }}>
            {renderPaidDateField("Backdate this if you paid the partner earlier — it's the date shown on both sides.")}
            <Pressable
              onPress={handleMarkPaid}
              style={{ height: 46, borderRadius: 999, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center' }}
            >
              <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14 }}>Mark paid</MoneyText>
            </Pressable>
          </View>
        ) : bill.status === 'paid' && editingPaidDate ? (
          <View style={{ gap: 12, borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, padding: 16 }}>
            {renderPaidDateField('Wrong date? Change it here — it updates on both sides.')}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => {
                  setPaidDate(bill.paidAt ? new Date(bill.paidAt) : new Date());
                  setEditingPaidDate(false);
                }}
                style={{ flex: 1, height: 46, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center' }}
              >
                <MoneyText style={{ color: palette.text, fontSize: 14 }}>Cancel</MoneyText>
              </Pressable>
              <Pressable
                onPress={() => {
                  handleUpdatePaidDate();
                  setEditingPaidDate(false);
                }}
                disabled={!paidDateChanged}
                style={{ flex: 1, height: 46, borderRadius: 999, backgroundColor: paidDateChanged ? FYLL_LIME : palette.softFill, alignItems: 'center', justifyContent: 'center' }}
              >
                <MoneyText style={{ color: paidDateChanged ? FYLL_LIME_INK : palette.faint, fontSize: 14 }}>Save date</MoneyText>
              </Pressable>
            </View>
          </View>
        ) : null}
        <View style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, overflow: 'hidden' }}>
          <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
            {bill.jobCount} {bill.jobCount === 1 ? 'Job' : 'Jobs'}
          </Text>
          {bill.jobs.map((job, index) => {
            const orderNumber = job.orderId ? orderById.get(job.orderId)?.orderNumber : null;
            const thumbnailUrl = getJobThumbnailUrl(job);
            return (
              <View
                key={job.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: palette.hairline }}
              >
                <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: palette.softFill, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                  {thumbnailUrl ? (
                    <ResolvedAttachmentImage imageUrl={thumbnailUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <Glasses size={18} color={palette.faint} strokeWidth={1.8} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: palette.text, fontSize: 12, lineHeight: 18, fontWeight: '600' }} numberOfLines={1}>
                    {job.customerName}
                  </Text>
                  <Text style={{ color: palette.faint, fontSize: 10, marginTop: 2 }} numberOfLines={1}>
                    {job.jobType || job.itemLabel || 'Job'} · {orderNumber ?? job.id.slice(-6).toUpperCase()}
                  </Text>
                </View>
                <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }}>
                  {formatCurrency(job.amount ?? 0)}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={{ borderRadius: 26, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.card, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ color: palette.faint, fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.1 }}>
              Activity
            </Text>
            <Text style={{ color: palette.faint, fontSize: 12 }}>
              {activityEntries.length} {activityEntries.length === 1 ? 'event' : 'events'}
            </Text>
          </View>
          <View style={{ gap: 14 }}>
            {activityEntries.map((entry, index) => (
              <View key={`${entry.label}-${entry.at}-${index}`} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: entry.tone === 'primary' ? palette.limeOnSurface : palette.outline, marginTop: 5 }} />
                  {index < activityEntries.length - 1 ? (
                    <View style={{ width: 1, flex: 1, backgroundColor: palette.hairline, marginTop: 6, minHeight: 28 }} />
                  ) : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: palette.text, fontSize: 10, lineHeight: 15, fontWeight: '600' }}>
                    {entry.label}
                  </Text>
                  <Text style={{ color: palette.faint, fontSize: 10, marginTop: 2 }}>
                    {entry.actor} · {formatDateTime(entry.at)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 }}>
          <Calendar size={14} color={palette.faint} strokeWidth={2} />
          <Text style={{ color: palette.faint, fontSize: 12 }}>
            Submitted {formatDate(bill.submittedAt)} for {businessLabel}
          </Text>
        </View>
      </ScrollView>

      {Platform.OS !== 'web' && showPaidDatePicker ? (
        <Modal visible transparent animationType="fade" onRequestClose={() => setShowPaidDatePicker(false)}>
          <Pressable
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}
            onPress={() => setShowPaidDatePicker(false)}
          >
            <Pressable
              onPress={(e) => e.stopPropagation()}
              style={{ width: '90%', maxWidth: 400, borderRadius: 28, overflow: 'hidden', backgroundColor: palette.card }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>Date paid</Text>
                <Pressable onPress={() => setShowPaidDatePicker(false)} style={{ padding: 4 }}>
                  <X size={18} color={colors.text.tertiary} strokeWidth={2} />
                </Pressable>
              </View>
              <View style={{ padding: 16, alignItems: 'center' }}>
                <DateTimePicker
                  value={paidDate}
                  mode="date"
                  maximumDate={new Date()}
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(_event, date) => {
                    if (Platform.OS === 'android') setShowPaidDatePicker(false);
                    if (date) setPaidDate(date);
                  }}
                  style={{ width: '100%' }}
                  themeVariant={colors.bg.primary === '#111111' ? 'dark' : 'light'}
                />
                {Platform.OS === 'ios' ? (
                  <Pressable
                    onPress={() => setShowPaidDatePicker(false)}
                    style={{ marginTop: 12, height: 46, width: '100%', borderRadius: 999, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <MoneyText style={{ color: FYLL_LIME_INK, fontSize: 14 }}>Done</MoneyText>
                  </Pressable>
                ) : null}
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}
