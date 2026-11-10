import { useMemo } from 'react';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore, { type Procurement } from '@/lib/state/fyll-store';
import { canShowFinanceNavigation } from '@/lib/finance-access';
import { isBusinessFeatureEnabled } from '@/lib/feature-access';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';

// Everything that is waiting on the signed-in person, for the banners at the top of Home: expense, refund and
// purchase-order requests (owners), and partner bills and issues (owners and managers). Each one has the count, the
// wording for the banner and the page that handles it, so nobody has to go looking in Finance or Partners.
export type PendingRequest = {
  id: string;
  count: number;
  boldText: string;
  restText: string;
  actionLabel: string;
  route: string;
};

const countLabel = (count: number, singular: string, plural = `${singular}s`) => `${count} ${count === 1 ? singular : plural}`;

// Mirrors how Finance reads a purchase order's approval from its notes, so Home and Finance always agree.
const readMetadata = (notes: string | undefined, key: string): string | null => {
  if (!notes) return null;
  const pattern = /\[([a-z_]+):([^\]]+)\]/gi;
  let match = pattern.exec(notes);
  while (match) {
    if (match[1]?.toLowerCase() === key) return match[2]?.trim() ?? null;
    match = pattern.exec(notes);
  }
  return null;
};

const isPurchaseOrderAwaitingApproval = (procurement: Procurement): boolean => {
  if (readMetadata(procurement.notes, 'mode')?.toLowerCase() === 'costing') return false;
  const approval = readMetadata(procurement.notes, 'approval_status')?.toLowerCase();
  if (approval === 'draft' || approval === 'submitted' || approval === 'approved' || approval === 'rejected') {
    return approval === 'submitted';
  }
  return readMetadata(procurement.notes, 'status')?.trim().toLowerCase().replace(/[_-]+/g, ' ') === 'pending approval';
};

export function usePendingRequests(): PendingRequest[] {
  const role = useAuthStore((s) => s.currentUser?.role ?? 'staff');
  const currentUserId = useAuthStore((s) => s.currentUser?.id ?? '');
  const currentUserName = useAuthStore((s) => s.currentUser?.name ?? '');
  const { featureAccess } = useBusinessSettings();
  const expenseRequests = useFyllStore((s) => s.expenseRequests);
  const refundRequests = useFyllStore((s) => s.refundRequests);
  const procurements = useFyllStore((s) => s.procurements);
  const partners = useFyllStore((s) => s.partners);
  const partnerJobs = useFyllStore((s) => s.partnerJobs);
  const partnerJobIssues = useFyllStore((s) => s.partnerJobIssues);

  const isOwner = role === 'admin';
  const canApproveFinance = isOwner && canShowFinanceNavigation(role) && isBusinessFeatureEnabled(featureAccess, 'finance');
  // Managers and staff do not approve anything, but they can see where their own requests stand.
  const canTrackOwnFinance = !isOwner && canShowFinanceNavigation(role) && isBusinessFeatureEnabled(featureAccess, 'finance');
  const canSeePartners = role === 'admin' || role === 'manager';

  return useMemo(() => {
    const list: PendingRequest[] = [];

    // Same rule as Finance: a request is yours if it carries your user id, or your name when the id is missing.
    const isMine = (submittedByUserId?: string, submittedByName?: string) => {
      const id = currentUserId.trim();
      if (id && submittedByUserId === id) return true;
      const name = currentUserName.trim().toLowerCase();
      return Boolean(name) && (submittedByName ?? '').trim().toLowerCase() === name;
    };

    if (canTrackOwnFinance) {
      const myExpenses = (expenseRequests ?? []).filter((request) => request.status === 'submitted' && isMine(request.submittedByUserId, request.submittedByName)).length;
      if (myExpenses > 0) {
        list.push({
          id: 'my-expense-requests',
          count: myExpenses,
          boldText: countLabel(myExpenses, 'expense request'),
          restText: myExpenses === 1 ? ' of yours is waiting for approval' : ' of yours are waiting for approval',
          actionLabel: 'View',
          route: '/(tabs)/finance?section=expenses',
        });
      }

      const myRefunds = (refundRequests ?? []).filter((request) => (request.status === 'submitted' || request.status === 'approved') && isMine(request.submittedByUserId, request.submittedByName)).length;
      if (myRefunds > 0) {
        list.push({
          id: 'my-refund-requests',
          count: myRefunds,
          boldText: countLabel(myRefunds, 'refund request'),
          restText: myRefunds === 1 ? ' of yours is waiting for review or payout' : ' of yours are waiting for review or payout',
          actionLabel: 'View',
          route: '/(tabs)/finance?section=refunds',
        });
      }

      const myPurchaseOrders = (procurements ?? []).filter((procurement) => (
        isPurchaseOrderAwaitingApproval(procurement)
        && isMine(readMetadata(procurement.notes, 'submitted_by_user_id') ?? undefined, readMetadata(procurement.notes, 'submitted_by_name') ?? undefined)
      )).length;
      if (myPurchaseOrders > 0) {
        list.push({
          id: 'my-purchase-orders',
          count: myPurchaseOrders,
          boldText: countLabel(myPurchaseOrders, 'purchase order'),
          restText: myPurchaseOrders === 1 ? ' of yours is waiting for approval' : ' of yours are waiting for approval',
          actionLabel: 'View',
          route: '/(tabs)/finance?section=procurement',
        });
      }
    }

    if (canApproveFinance) {
      const expenses = (expenseRequests ?? []).filter((request) => request.status === 'submitted').length;
      if (expenses > 0) {
        list.push({
          id: 'expense-requests',
          count: expenses,
          boldText: countLabel(expenses, 'expense request'),
          restText: expenses === 1 ? ' from your team is waiting for approval' : ' from your team are waiting for approval',
          actionLabel: 'Review',
          route: '/(tabs)/finance?section=expenses&review=expenses',
        });
      }

      const refunds = (refundRequests ?? []).filter((request) => request.status === 'submitted').length;
      if (refunds > 0) {
        list.push({
          id: 'refund-requests',
          count: refunds,
          boldText: countLabel(refunds, 'refund request'),
          restText: refunds === 1 ? ' from your team is waiting for approval' : ' from your team are waiting for approval',
          actionLabel: 'Review',
          route: '/(tabs)/finance?section=refunds&review=refunds',
        });
      }

      // Approved but not yet paid out: still waiting on someone, so it stays on Home until it is paid.
      const awaitingPayout = (refundRequests ?? []).filter((request) => request.status === 'approved').length;
      if (awaitingPayout > 0) {
        list.push({
          id: 'refund-payouts',
          count: awaitingPayout,
          boldText: countLabel(awaitingPayout, 'approved refund'),
          restText: awaitingPayout === 1 ? ' is waiting for payout' : ' are waiting for payout',
          actionLabel: 'Pay out',
          route: '/(tabs)/finance?section=refunds',
        });
      }

      const purchaseOrders = (procurements ?? []).filter(isPurchaseOrderAwaitingApproval).length;
      if (purchaseOrders > 0) {
        list.push({
          id: 'purchase-orders',
          count: purchaseOrders,
          boldText: countLabel(purchaseOrders, 'purchase order'),
          restText: purchaseOrders === 1 ? ' from your team is waiting for approval' : ' from your team are waiting for approval',
          actionLabel: 'Review',
          route: '/(tabs)/finance?section=procurement&review=procurement',
        });
      }
    }

    if (canSeePartners) {
      // One bill covers several jobs, so count each bill once; same rule as the Bills page ("Pending").
      const partnerIds = new Set((partners ?? []).map((partner) => partner.id));
      const seenBills = new Set<string>();
      let pendingBills = 0;
      (partnerJobs ?? []).forEach((job) => {
        if (!job.billId || seenBills.has(job.billId)) return;
        seenBills.add(job.billId);
        if (partnerIds.has(job.partnerId) && (job.billStatus ?? 'pending') === 'pending') pendingBills += 1;
      });
      if (pendingBills > 0) {
        list.push({
          id: 'partner-bills',
          count: pendingBills,
          boldText: countLabel(pendingBills, 'partner bill'),
          restText: pendingBills === 1 ? ' is waiting for your review' : ' are waiting for your review',
          actionLabel: 'Review',
          route: '/partners?partnerSection=bills',
        });
      }

      const openIssues = (partnerJobIssues ?? []).filter((issue) => issue.status === 'open').length;
      if (openIssues > 0) {
        list.push({
          id: 'partner-issues',
          count: openIssues,
          boldText: countLabel(openIssues, 'partner issue'),
          restText: openIssues === 1 ? ' is open and needs your attention' : ' are open and need your attention',
          actionLabel: 'View',
          route: '/partners?partnerSection=issues',
        });
      }
    }

    return list;
  }, [canApproveFinance, canSeePartners, canTrackOwnFinance, currentUserId, currentUserName, expenseRequests, partnerJobIssues, partnerJobs, partners, procurements, refundRequests]);
}
