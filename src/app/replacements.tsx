import React, { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Repeat } from 'lucide-react-native';
import useFyllStore from '@/lib/state/fyll-store';
import { CaseAreaDateTabs, CaseAreaList, CaseAreaPills, CaseAreaShell, CaseAreaStats, inDateRange, type CaseAreaDateRange, type CaseAreaRowData } from '@/components/CaseAreaShell';
import { EmptyState } from '@/components/EmptyState';

type Filter = 'active' | 'done' | 'all';
const DONE = /deliver|complete|collected|cancel|refund/i;

// Every replacement order sent out from a case, so the team can see what still has to reach the customer.
export default function ReplacementsScreen() {
  const router = useRouter();
  const orders = useFyllStore((s) => s.orders);
  const [filter, setFilter] = useState<Filter>('active');
  const [range, setRange] = useState<CaseAreaDateRange>('30d');
  const [search, setSearch] = useState<string>('');

  const query = search.trim().toLowerCase();
  const matches = (order: (typeof orders)[number]) => !query || [order.customerName, order.orderNumber, order.replacementFor?.caseNumber, order.replacementFor?.orderNumber, ...order.items.map((line) => line.productName)].some((value) => (value ?? '').toLowerCase().includes(query));
  const replacements = useMemo(
    () => orders
      .filter((order) => (order.orderClassification === 'Replacement' || Boolean(order.replacementFor)) && inDateRange(order.createdAt, range) && matches(order))
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? '')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orders, range, search],
  );
  const active = replacements.filter((order) => !DONE.test(order.status ?? ''));
  const done = replacements.filter((order) => DONE.test(order.status ?? ''));
  const shown = filter === 'active' ? active : filter === 'done' ? done : replacements;

  const thisMonth = new Date().toISOString().slice(0, 7);
  const sentThisMonth = replacements.filter((order) => (order.createdAt ?? '').startsWith(thisMonth)).length;
  const rows: CaseAreaRowData[] = shown.map((order) => {
    const isDone = DONE.test(order.status ?? '');
    return {
      id: order.id,
      cells: [
        order.customerName || 'Customer',
        `#${order.orderNumber}`,
        order.replacementFor?.caseNumber ?? '',
        order.replacementFor?.orderNumber ? `#${order.replacementFor.orderNumber}` : '',
        order.items.map((line) => `${line.quantity}× ${line.productName ?? 'Item'}`).join(', '),
        '',
        new Date(order.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
      ],
      at: order.createdAt,
      title: order.customerName || 'Customer',
      ref: `#${order.orderNumber}`,
      meta: [order.replacementFor?.caseNumber, order.replacementFor?.orderNumber ? `replaces #${order.replacementFor.orderNumber}` : null].filter(Boolean).join(' · '),
      date: new Date(order.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }),
      status: order.status || 'New',
      statusColor: isDone ? '#16A34A' : '#F59E0B',
      onPress: () => router.push(`/order/${order.id}` as never),
    };
  });

  return (
    <CaseAreaShell title="Replacements" subtitle="Free resends from cases, from dispatch to delivery." navKey="replacements">
      <CaseAreaDateTabs value={range} onChange={setRange} />
      <CaseAreaStats
        hero={{ label: 'In progress', value: String(active.length), hint: active.length === 1 ? 'Replacement on its way' : 'Replacements on their way' }}
        stats={[
          { label: 'Done', value: String(done.length), dot: '#16A34A' },
          { label: 'Sent this month', value: String(sentThisMonth), dot: '#9CA3AF' },
        ]}
      />
      <CaseAreaPills
        filters={[
          { key: 'active', label: 'In progress', count: active.length },
          { key: 'done', label: 'Done', count: done.length },
          { key: 'all', label: 'All', count: replacements.length },
        ]}
        value={filter}
        onChange={setFilter}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search replacements"
      />
      {rows.length === 0 ? (
        <EmptyState icon={Repeat} title="No replacements here" description="Replacement orders made from a case show up here." />
      ) : (
        <CaseAreaList
          rows={rows}
          columns={[
            { label: 'Customer', flex: 1.4 },
            { label: 'Replacement', flex: 1 },
            { label: 'Case', flex: 1 },
            { label: 'Replaces', flex: 1 },
            { label: 'Items', flex: 1.6 },
            { label: 'Status', flex: 1 },
            { label: 'Time', flex: 0.7 },
          ]}
        />
      )}
    </CaseAreaShell>
  );
}
