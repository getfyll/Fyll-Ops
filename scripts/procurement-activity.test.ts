import { describe, expect, test } from 'bun:test';
import { getProcurementActivity, getProcurementSubmitter } from '../src/lib/procurement-activity';

const base = { createdAt: '2026-11-01T09:00:00.000Z', createdBy: 'Boss' };

describe('procurement activity', () => {
  test('a PO created by an admin shows one entry, and Submitted by is the creator', () => {
    const po = { ...base, notes: '' };
    expect(getProcurementActivity(po)).toEqual([{ label: 'PO created', at: base.createdAt, actorName: 'Boss' }]);
    expect(getProcurementSubmitter(po)).toBe('Boss');
  });

  test('a submitted PO lists creation then submission, newest first, by the person who submitted it', () => {
    const po = { ...base, notes: '[submitted_by_name:Ada][approval_status:submitted][submitted_at:2026-11-02T10:00:00.000Z]' };
    const entries = getProcurementActivity(po);
    expect(entries.map((e) => e.label)).toEqual(['Submitted for approval', 'PO created']);
    expect(entries[0]).toMatchObject({ actorName: 'Ada', at: '2026-11-02T10:00:00.000Z' });
    expect(getProcurementSubmitter(po)).toBe('Ada');
  });

  test('approved and declined orders add the review step with the reviewer', () => {
    const approved = getProcurementActivity({ ...base, notes: '[submitted_by_name:Ada][approval_status:approved][reviewed_by_name:Boss][reviewed_at:2026-11-03T08:00:00.000Z]' });
    expect(approved.map((e) => e.label)).toEqual(['PO approved', 'Submitted for approval', 'PO created']);
    expect(approved[0]).toMatchObject({ actorName: 'Boss', at: '2026-11-03T08:00:00.000Z' });

    const declined = getProcurementActivity({ ...base, notes: '[approval_status:rejected][reviewed_by_name:Boss]' });
    expect(declined[0]).toMatchObject({ label: 'PO declined', actorName: 'Boss', at: '' });
  });

  test('no submitter anywhere gives an empty name rather than a guess', () => {
    expect(getProcurementSubmitter({ notes: '', createdBy: undefined })).toBe('');
  });
});
