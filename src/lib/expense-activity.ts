import type { Expense, ExpenseRequest } from '@/lib/state/fyll-store';

// Who submitted an expense, and what has happened to it, for the expense detail page and panel.
//
// An expense a team member requested keeps the request it came from (ExpenseRequest.approvedExpenseId points back at
// the expense), so the person who submitted it and the review are known. An expense entered directly only has the
// name of whoever created it. Edits made to an expense are not recorded, so they do not appear here.

export type ExpenseActivityEntry = {
  label: string;
  detail?: string;
  at: string;
  actorName: string;
};

const validTime = (value?: string) => Boolean(value) && Number.isFinite(new Date(value as string).getTime());

export const findExpenseRequest = (expense: Pick<Expense, 'id'>, requests: readonly ExpenseRequest[]): ExpenseRequest | null => (
  requests.find((request) => request.approvedExpenseId === expense.id) ?? null
);

export const getExpenseSubmitter = (
  expense: Pick<Expense, 'createdBy'>,
  request: Pick<ExpenseRequest, 'submittedByName'> | null
): string => (request?.submittedByName?.trim() || expense.createdBy?.trim() || '');

// Newest first.
export const getExpenseActivity = (
  expense: Pick<Expense, 'createdAt' | 'createdBy'>,
  request: Pick<ExpenseRequest, 'status' | 'submittedAt' | 'createdAt' | 'submittedByName' | 'reviewedAt' | 'reviewedByName' | 'rejectionReason'> | null
): ExpenseActivityEntry[] => {
  const entries: ExpenseActivityEntry[] = [];

  if (request) {
    const submittedAt = request.submittedAt || request.createdAt;
    if (validTime(submittedAt)) {
      entries.push({ label: 'Expense requested', at: submittedAt as string, actorName: request.submittedByName || 'Team Member' });
    }
    if (request.status === 'approved') {
      const approvedAt = request.reviewedAt || expense.createdAt;
      if (validTime(approvedAt)) entries.push({ label: 'Approved & logged', at: approvedAt, actorName: request.reviewedByName || 'Admin' });
    } else if (request.status === 'rejected' && request.reviewedAt && validTime(request.reviewedAt)) {
      entries.push({ label: 'Declined', detail: request.rejectionReason || undefined, at: request.reviewedAt, actorName: request.reviewedByName || 'Admin' });
    }
  } else if (validTime(expense.createdAt)) {
    entries.push({ label: 'Expense logged', at: expense.createdAt, actorName: expense.createdBy || 'Admin' });
  }

  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
};
