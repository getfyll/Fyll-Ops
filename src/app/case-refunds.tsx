import React, { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Banknote } from 'lucide-react-native';
import useFyllStore, { type RefundRequestStatus } from '@/lib/state/fyll-store';
import { useBusinessCurrency } from '@/hooks/useBusinessCurrency';
import { CaseAreaDateTabs, CaseAreaList, CaseAreaPills, CaseAreaShell, CaseAreaStats, inDateRange, type CaseAreaDateRange, type CaseAreaRowData } from '@/components/CaseAreaShell';
import { EmptyState } from '@/components/EmptyState';

type Filter = 'waiting' | 'paid' | 'all';
const STATUS_LABEL: Record<RefundRequestStatus, string> = {
  draft: 'Draft', submitted: 'Awaiting approval', approved: 'Approved, to pay', rejected: 'Rejected', paid: 'Paid', void: 'Void',
};
const isWaiting = (status: RefundRequestStatus) => status === 'draft' || status === 'submitted' || status === 'approved';

// Refund requests the team raised, so they can follow them up without opening Finance.
export default function CaseRefundsScreen() {
  const router = useRouter();
  const { formatMoney } = useBusinessCurrency();
  const refundRequests = useFyllStore((s) => s.refundRequests);
  const [filter, setFilter] = useState<Filter>('waiting');
  const [range, setRange] = useState<CaseAreaDateRange>('30d');
  const [search, setSearch] = useState<string>('');

  const query = search.trim().toLowerCase();
  const matches = (item: (typeof refundRequests)[number]) => !query || [item.customerName, item.orderNumber, item.caseNumber, item.reason, item.submittedByName].some((value) => (value ?? '').toLowerCase().includes(query));
  const all = useMemo(
    () => refundRequests.filter((item) => inDateRange(item.requestedDate || item.createdAt, range) && matches(item)).sort((a, b) => new Date(b.requestedDate || b.createdAt).getTime() - new Date(a.requestedDate || a.createdAt).getTime()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refundRequests, range, search],
  );
  const waiting = all.filter((item) => isWaiting(item.status));
  const paid = all.filter((item) => item.status === 'paid');
  const shown = filter === 'waiting' ? waiting : filter === 'paid' ? paid : all;

  const owed = waiting.reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const approved = waiting.filter((item) => item.status === 'approved').length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const paidThisMonth = paid.filter((item) => (item.paidAt ?? item.updatedAt ?? '').startsWith(thisMonth)).reduce((sum, item) => sum + (item.amount ?? 0), 0);
  const statusColor = (status: RefundRequestStatus) => (status === 'paid' ? '#16A34A' : status === 'rejected' ? '#DC2626' : status === 'void' ? '#9CA3AF' : '#F59E0B');
  const rows: CaseAreaRowData[] = shown.map((item) => ({
    id: item.id,
    cells: [
      item.customerName || 'Customer',
      `#${item.orderNumber}`,
      item.caseNumber ?? '',
      item.reason,
      item.submittedByName ?? '',
      '',
      formatMoney(item.amount),
    ],
    at: item.requestedDate || item.createdAt,
    title: item.customerName || 'Customer',
    ref: `#${item.orderNumber}`,
    meta: [item.caseNumber, item.reason].filter(Boolean).join(' · '),
    date: new Date(item.requestedDate || item.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
    status: STATUS_LABEL[item.status] ?? item.status,
    statusColor: statusColor(item.status),
    amount: formatMoney(item.amount),
    onPress: () => router.push((item.caseId ? `/case/${item.caseId}` : `/order/${item.orderId}`) as never),
  }));

  return (
    <CaseAreaShell title="Refunds" subtitle="Refund requests from cases and orders, from request to paid." navKey="refunds">
      <CaseAreaDateTabs value={range} onChange={setRange} />
      <CaseAreaStats
        hero={{ label: 'Still to refund', value: formatMoney(owed), hint: `${waiting.length} waiting · ${approved} approved to pay` }}
        stats={[
          { label: 'Paid this month', value: formatMoney(paidThisMonth), dot: '#16A34A' },
          { label: 'Approved', value: String(approved), dot: '#F59E0B' },
          { label: 'Paid', value: String(paid.length), dot: '#9CA3AF' },
        ]}
      />
      <CaseAreaPills
        filters={[
          { key: 'waiting', label: 'Waiting', count: waiting.length },
          { key: 'paid', label: 'Paid', count: paid.length },
          { key: 'all', label: 'All', count: all.length },
        ]}
        value={filter}
        onChange={setFilter}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search refunds"
      />
      {rows.length === 0 ? (
        <EmptyState icon={Banknote} title="No refunds here" description="Refund requests raised from a case or order show up here." />
      ) : (
        <CaseAreaList
          rows={rows}
          columns={[
            { label: 'Customer', flex: 1.4 },
            { label: 'Order', flex: 1 },
            { label: 'Case', flex: 1 },
            { label: 'Reason', flex: 2 },
            { label: 'Requested by', flex: 1.1 },
            { label: 'Status', flex: 1.2 },
            { label: 'Amount', flex: 1, align: 'right' },
          ]}
        />
      )}
    </CaseAreaShell>
  );
}
