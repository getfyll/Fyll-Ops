import { describe, expect, test } from 'bun:test';
import { deriveRefundActivity, getRefundActivity, initialRefundActivityLog, nextRefundActivityLog } from '../src/lib/refund-activity';

const money = (amount: number) => `N${amount.toLocaleString('en-US')}`;

const base = {
  status: 'submitted' as const,
  amount: 5000,
  reason: 'Wrong size',
  note: '',
  refundType: 'partial' as const,
  applyBankCharges: false,
  attachments: [],
  submittedByName: 'Ada',
  requestedDate: '2026-11-01T09:00:00.000Z',
  createdAt: '2026-11-01T09:00:00.000Z',
};

describe('refund activity', () => {
  test('an older refund (no log) is rebuilt from the dates it already has', () => {
    const entries = deriveRefundActivity({
      ...base,
      status: 'paid',
      reviewedAt: '2026-11-02T10:00:00.000Z',
      reviewedByName: 'Boss',
      paidAt: '2026-11-03T11:00:00.000Z',
      paidByName: 'Ada',
      paymentReference: 'TRX1',
    });
    expect(entries.map((e) => e.label)).toEqual(['Refund requested', 'Refund approved', 'Refund paid']);
    expect(entries[2].detail).toBe('Ref TRX1');
    expect(entries[1].actorName).toBe('Boss');
  });

  test('shows newest first, and ignores entries with no usable date', () => {
    const shown = getRefundActivity({
      ...base,
      activityLog: [
        { label: 'Refund requested', at: '2026-11-01T09:00:00.000Z', actorName: 'Ada' },
        { label: 'Refund approved', at: '2026-11-02T09:00:00.000Z', actorName: 'Boss' },
        { label: 'Broken', at: 'not a date', actorName: 'x' },
      ],
    });
    expect(shown.map((e) => e.label)).toEqual(['Refund approved', 'Refund requested']);
  });

  test('a new refund starts its log', () => {
    expect(initialRefundActivityLog(base, 'Fallback', '2026-11-05T00:00:00.000Z')[0]).toEqual({
      label: 'Refund requested',
      at: '2026-11-01T09:00:00.000Z',
      actorName: 'Ada',
    });
    expect(initialRefundActivityLog({ ...base, status: 'draft' }, 'x', '2026-11-05T00:00:00.000Z')[0].label).toBe('Draft created');
  });

  test('approving, rejecting, paying and voiding each add one entry with the right person', () => {
    const now = '2026-11-06T00:00:00.000Z';
    const approved = nextRefundActivityLog(base, { ...base, status: 'approved', reviewedByName: 'Boss' }, 'Boss', now, money);
    expect(approved.at(-1)).toMatchObject({ label: 'Refund approved', actorName: 'Boss' });

    const rejected = nextRefundActivityLog(base, { ...base, status: 'rejected', reviewedByName: 'Boss', rejectionReason: 'Out of window' }, 'Boss', now, money);
    expect(rejected.at(-1)).toMatchObject({ label: 'Refund rejected', detail: 'Out of window' });

    const paid = nextRefundActivityLog({ ...base, status: 'approved' }, { ...base, status: 'paid', paidByName: 'Ada', paymentReference: 'R9' }, 'Ada', now, money);
    expect(paid.at(-1)).toMatchObject({ label: 'Refund paid', detail: 'Ref R9', actorName: 'Ada' });

    const voided = nextRefundActivityLog(base, { ...base, status: 'void', voidedByName: 'Boss', voidReason: 'Duplicate' }, 'Boss', now, money);
    expect(voided.at(-1)).toMatchObject({ label: 'Marked void', detail: 'Duplicate' });
  });

  test('"more info needed" is its own entry, and resubmitting after it says so', () => {
    const now = '2026-11-06T00:00:00.000Z';
    const asked = nextRefundActivityLog(base, { ...base, status: 'draft', reviewedByName: 'Boss', rejectionReason: 'More info needed: add the receipt' }, 'Boss', now, money);
    expect(asked.at(-1)).toMatchObject({ label: 'More info requested', detail: 'add the receipt', actorName: 'Boss' });

    const resubmitted = nextRefundActivityLog(
      { ...base, status: 'draft', rejectionReason: 'More info needed: add the receipt' },
      { ...base, status: 'submitted' },
      'Ada', now, money
    );
    expect(resubmitted.at(-1)?.label).toBe('Resubmitted for approval');
  });

  test('editing the request records what changed, by whoever signed in', () => {
    const now = '2026-11-06T00:00:00.000Z';
    const edited = nextRefundActivityLog(base, { ...base, amount: 7500, reason: 'Wrong colour', applyBankCharges: true }, 'Ada', now, money);
    expect(edited.at(-1)).toMatchObject({ label: 'Request edited', actorName: 'Ada' });
    expect(edited.at(-1)?.detail).toContain('Amount changed from N5,000 to N7,500');
    expect(edited.at(-1)?.detail).toContain('Reason updated');
    expect(edited.at(-1)?.detail).toContain('Bank charges applied');
  });

  test('a save that changes nothing adds nothing', () => {
    const log = [{ label: 'Refund requested', at: '2026-11-01T09:00:00.000Z', actorName: 'Ada' }];
    const same = nextRefundActivityLog({ ...base, activityLog: log }, { ...base, activityLog: log }, 'Ada', '2026-11-06T00:00:00.000Z', money);
    expect(same).toEqual(log);
  });

  test('the first save on an older refund keeps what could be rebuilt, then adds the new entry', () => {
    const old = { ...base, status: 'approved' as const, reviewedAt: '2026-11-02T10:00:00.000Z', reviewedByName: 'Boss' };
    const next = nextRefundActivityLog(old, { ...old, status: 'paid', paidByName: 'Ada' }, 'Ada', '2026-11-06T00:00:00.000Z', money);
    expect(next.map((e) => e.label)).toEqual(['Refund requested', 'Refund approved', 'Refund paid']);
  });
});
