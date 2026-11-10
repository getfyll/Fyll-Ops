import { describe, expect, test } from 'bun:test';
import { findExpenseRequest, getExpenseActivity, getExpenseSubmitter } from '../src/lib/expense-activity';

const expense = { id: 'e1', createdAt: '2026-11-03T10:00:00.000Z', createdBy: 'Boss' };
const request = {
  id: 'r1', approvedExpenseId: 'e1', status: 'approved' as const,
  submittedByName: 'Ada', submittedAt: '2026-11-01T09:00:00.000Z', createdAt: '2026-11-01T09:00:00.000Z',
  reviewedByName: 'Boss', reviewedAt: '2026-11-02T09:00:00.000Z',
};

describe('expense activity', () => {
  test('finds the request an expense came from', () => {
    expect(findExpenseRequest({ id: 'e1' }, [{ ...request } as never])?.id).toBe('r1');
    expect(findExpenseRequest({ id: 'other' }, [{ ...request } as never])).toBeNull();
  });

  test('submitted by is the person who requested it, else whoever logged it', () => {
    expect(getExpenseSubmitter(expense, request)).toBe('Ada');
    expect(getExpenseSubmitter(expense, null)).toBe('Boss');
    expect(getExpenseSubmitter({ createdBy: undefined }, null)).toBe('');
  });

  test('a requested expense shows request then approval, newest first', () => {
    const entries = getExpenseActivity(expense, request);
    expect(entries.map((e) => e.label)).toEqual(['Approved & logged', 'Expense requested']);
    expect(entries[0].actorName).toBe('Boss');
    expect(entries[1].actorName).toBe('Ada');
  });

  test('an expense entered directly shows one logged entry', () => {
    expect(getExpenseActivity(expense, null)).toEqual([{ label: 'Expense logged', at: expense.createdAt, actorName: 'Boss' }]);
  });

  test('a declined request keeps the reason', () => {
    const entries = getExpenseActivity(expense, { ...request, status: 'rejected', rejectionReason: 'Not budgeted' });
    expect(entries[0]).toMatchObject({ label: 'Declined', detail: 'Not budgeted' });
  });
});
