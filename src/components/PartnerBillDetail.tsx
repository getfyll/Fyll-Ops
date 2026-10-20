import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ArrowLeft, Calendar, Check, Glasses, MessageSquareWarning, Pencil, X } from 'lucide-react-native';
import { ResolvedAttachmentImage } from '@/components/ResolvedAttachmentImage';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { formatCurrency, type PartnerBillStatus, type PartnerJob } from '@/lib/state/fyll-store';
import { useThemeColors } from '@/lib/theme';

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
      <View style={{ flex: 1, backgroundColor: colors.bg.primary, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24, justifyContent: 'center' }}>
        <View style={{ borderRadius: 20, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 20, alignItems: 'center' }}>
          <Text style={{ color: colors.text.primary, fontSize: 16, fontWeight: '600' }}>Bill not found</Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 6, textAlign: 'center' }}>
            This bill may have been removed or is no longer available in the current partner list.
          </Text>
          <Pressable
            onPress={onClose}
            style={{ marginTop: 16, height: 44, borderRadius: 999, backgroundColor: colors.text.primary, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: colors.bg.primary, fontSize: 12.5, fontWeight: '600' }}>{embedded ? 'Close' : 'Back to bills'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const renderPaidDateField = (hint: string) => (
        <View>
          <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Date paid
          </Text>
          {Platform.OS === 'web' ? (
            <View style={{ height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' }}>
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
              style={{ height: 44, borderRadius: 10, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.secondary, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <Text style={{ color: colors.text.primary, fontSize: 13.5 }}>
                {paidDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
              <Calendar size={16} color={colors.text.tertiary} strokeWidth={2} />
            </Pressable>
          )}
          <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 6 }}>
            {hint}
          </Text>
        </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          width: '100%',
          paddingHorizontal: embedded ? 18 : 20,
          paddingTop: embedded ? 18 : 16,
          paddingBottom: embedded ? 28 : 120,
          gap: 14,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {embedded ? null : (
            <Pressable
              onPress={onClose}
              style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}
            >
              <ArrowLeft size={18} color={colors.text.primary} strokeWidth={2.2} />
            </Pressable>
          )}
          <Text style={{ flex: 1, color: colors.text.primary, fontSize: embedded ? 18 : 24, fontWeight: '700' }}>Bill Details</Text>
          {embedded ? (
            <Pressable
              onPress={onClose}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={16} color={colors.text.primary} strokeWidth={2.2} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ borderRadius: 22, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <Text style={{ color: colors.text.tertiary, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }} numberOfLines={1}>
              {bill.partner.name}
            </Text>
            <View style={{ paddingHorizontal: 12, height: 32, borderRadius: 999, backgroundColor: statusMeta.bg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: statusMeta.text, fontSize: 10, fontWeight: '600' }}>{statusMeta.label}</Text>
            </View>
          </View>
          <Text style={{ color: colors.text.primary, fontSize: 30, fontWeight: '700', marginTop: 10 }}>
            {formatCurrency(bill.total)}
          </Text>
          <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4 }}>
            {bill.jobCount} {bill.jobCount === 1 ? 'job' : 'jobs'} · Submitted {formatDate(bill.submittedAt)}
          </Text>
        </View>

        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Details
            </Text>
            {bill.status === 'paid' ? (
              <Pressable
                onPress={() => setEditingPaidDate((current) => !current)}
                accessibilityLabel="Edit bill"
                hitSlop={8}
                style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: editingPaidDate ? colors.text.primary : colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}
              >
                <Pencil size={13} color={editingPaidDate ? colors.bg.primary : colors.text.tertiary} strokeWidth={2.2} />
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
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border.light }}
            >
              <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>{row.label}</Text>
              <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600', flexShrink: 1, textAlign: 'right' }}>{row.value}</Text>
            </View>
          ))}
          {bill.note ? (
            <View style={{ paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.border.light }}>
              <Text style={{ color: colors.text.tertiary, fontSize: 12, marginBottom: 4 }}>
                {bill.status === 'rejected' ? 'Rejection note' : bill.status === 'queried' ? 'Query note' : 'Note'}
              </Text>
              <Text style={{ color: colors.text.primary, fontSize: 12, lineHeight: 18 }}>{bill.note}</Text>
            </View>
          ) : null}
        </View>

        {bill.status === 'pending' ? (
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={handleReject}
                style={{ flex: 1, height: 42, borderRadius: 999, backgroundColor: 'rgba(220, 38, 38, 0.12)', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: '#DC2626', fontSize: 13, fontWeight: '700' }}>Reject</Text>
              </Pressable>
              <Pressable
                onPress={handleApprove}
                style={{ flex: 1, height: 42, borderRadius: 999, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Check size={15} color={colors.bg.primary} strokeWidth={2.4} />
                  <Text style={{ color: colors.bg.primary, fontSize: 13, fontWeight: '700' }}>Approve</Text>
                </View>
              </Pressable>
            </View>
            <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <MessageSquareWarning size={16} color={colors.text.tertiary} strokeWidth={2} />
                <Text style={{ color: colors.text.primary, fontSize: 13, fontWeight: '600' }}>Query partner</Text>
              </View>
              <TextInput
                value={noteDraft}
                onChangeText={setNoteDraft}
                placeholder="Type your query to the partner"
                placeholderTextColor={colors.input.placeholder}
                multiline
                style={{
                  minHeight: 88,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border.light,
                  backgroundColor: colors.input.bg,
                  color: colors.input.text,
                  fontSize: 13,
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
                  backgroundColor: noteDraft.trim() ? colors.text.primary : colors.bg.secondary,
                  paddingHorizontal: 14,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text style={{ color: noteDraft.trim() ? colors.bg.primary : colors.text.tertiary, fontSize: 12.5, fontWeight: '600' }}>
                  Submit query
                </Text>
              </Pressable>
            </View>
          </View>
        ) : bill.status === 'approved' ? (
          <View style={{ gap: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
            {renderPaidDateField("Backdate this if you paid the partner earlier — it's the date shown on both sides.")}
            <Pressable
              onPress={handleMarkPaid}
              style={{ height: 42, borderRadius: 999, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: colors.bg.primary, fontSize: 13, fontWeight: '700' }}>Mark paid</Text>
            </Pressable>
          </View>
        ) : bill.status === 'paid' && editingPaidDate ? (
          <View style={{ gap: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, padding: 16 }}>
            {renderPaidDateField('Wrong date? Change it here — it updates on both sides.')}
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <Pressable
                onPress={() => {
                  setPaidDate(bill.paidAt ? new Date(bill.paidAt) : new Date());
                  setEditingPaidDate(false);
                }}
                style={{ flex: 1, height: 42, borderRadius: 999, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '700' }}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  handleUpdatePaidDate();
                  setEditingPaidDate(false);
                }}
                disabled={!paidDateChanged}
                style={{ flex: 1, height: 42, borderRadius: 999, backgroundColor: paidDateChanged ? colors.text.primary : colors.bg.secondary, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ color: paidDateChanged ? colors.bg.primary : colors.text.tertiary, fontSize: 13, fontWeight: '700' }}>Save date</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, overflow: 'hidden' }}>
          <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
            {bill.jobCount} {bill.jobCount === 1 ? 'Job' : 'Jobs'}
          </Text>
          {bill.jobs.map((job, index) => {
            const orderNumber = job.orderId ? orderById.get(job.orderId)?.orderNumber : null;
            const thumbnailUrl = getJobThumbnailUrl(job);
            return (
              <View
                key={job.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: index === 0 ? 0 : 1, borderTopColor: colors.border.light }}
              >
                <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: colors.bg.secondary, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
                  {thumbnailUrl ? (
                    <ResolvedAttachmentImage imageUrl={thumbnailUrl} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                  ) : (
                    <Glasses size={18} color={colors.text.tertiary} strokeWidth={1.8} />
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                    {job.customerName}
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                    {job.jobType || job.itemLabel || 'Job'} · {orderNumber ?? job.id.slice(-6).toUpperCase()}
                  </Text>
                </View>
                <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '700' }}>
                  {formatCurrency(job.amount ?? 0)}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: colors.border.light, backgroundColor: colors.bg.card, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ color: colors.text.tertiary, fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Activity
            </Text>
            <Text style={{ color: colors.text.tertiary, fontSize: 12 }}>
              {activityEntries.length} {activityEntries.length === 1 ? 'event' : 'events'}
            </Text>
          </View>
          <View style={{ gap: 14 }}>
            {activityEntries.map((entry, index) => (
              <View key={`${entry.label}-${entry.at}-${index}`} style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ alignItems: 'center' }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: entry.tone === 'primary' ? colors.text.primary : colors.text.muted, marginTop: 4 }} />
                  {index < activityEntries.length - 1 ? (
                    <View style={{ width: 1, flex: 1, backgroundColor: colors.border.light, marginTop: 6, minHeight: 28 }} />
                  ) : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: colors.text.primary, fontSize: 12, fontWeight: '600' }}>
                    {entry.label}
                  </Text>
                  <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 4 }}>
                    {entry.actor} · {formatDateTime(entry.at)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 2 }}>
          <Calendar size={14} color={colors.text.tertiary} strokeWidth={2} />
          <Text style={{ color: colors.text.tertiary, fontSize: 11 }}>
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
              style={{ width: '90%', maxWidth: 400, borderRadius: 16, overflow: 'hidden', backgroundColor: colors.bg.card }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '700' }}>Date paid</Text>
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
                    style={{ marginTop: 12, height: 44, width: '100%', borderRadius: 999, backgroundColor: colors.text.primary, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: colors.bg.primary, fontSize: 13.5, fontWeight: '600' }}>Done</Text>
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
