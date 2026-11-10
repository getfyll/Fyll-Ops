import type { RefundRequest } from '@/lib/state/fyll-store';

// The Activity list on a refund: who did what and when.
//
// New activity is recorded on the refund itself (activityLog) every time it is saved, by diffing the refund before and
// after. A refund made before this existed has no log, so its activity is rebuilt from the dates it already stores
// (requested, reviewed, paid, voided). Its earlier edits were never recorded and cannot be recovered.

export type RefundActivityEntry = {
  label: string;
  detail?: string;
  at: string;
  actorName: string;
};

type RefundForActivity = Pick<
  RefundRequest,
  | 'status' | 'amount' | 'reason' | 'note' | 'refundType' | 'applyBankCharges' | 'attachments'
  | 'submittedByName' | 'submittedAt' | 'requestedDate' | 'createdAt'
  | 'reviewedByName' | 'reviewedAt' | 'rejectionReason'
  | 'paidAt' | 'paidByName' | 'paymentReference'
  | 'voidedAt' | 'voidedByName' | 'voidReason'
  | 'activityLog'
>;

const MORE_INFO_PREFIX = /^more info needed:?\s*/i;
const isMoreInfo = (reason?: string) => MORE_INFO_PREFIX.test((reason ?? '').trim());
const validTime = (value?: string) => Boolean(value) && Number.isFinite(new Date(value as string).getTime());

// Activity for a refund that has no log yet, from the dates it already carries.
export const deriveRefundActivity = (request: RefundForActivity): RefundActivityEntry[] => {
  const entries: RefundActivityEntry[] = [];
  const requestedAt = request.submittedAt || request.requestedDate || request.createdAt;
  if (validTime(requestedAt)) {
    entries.push({ label: 'Refund requested', at: requestedAt as string, actorName: request.submittedByName || 'Team Member' });
  }
  if (request.reviewedAt && validTime(request.reviewedAt)) {
    const approved = request.status === 'approved' || request.status === 'paid';
    entries.push({
      label: approved ? 'Refund approved' : request.status === 'rejected' ? 'Refund rejected' : 'More info requested',
      detail: !approved && request.rejectionReason ? request.rejectionReason.replace(MORE_INFO_PREFIX, '') : undefined,
      at: request.reviewedAt,
      actorName: request.reviewedByName || 'Admin',
    });
  }
  if (request.paidAt && validTime(request.paidAt)) {
    entries.push({
      label: 'Refund paid',
      detail: request.paymentReference ? `Ref ${request.paymentReference}` : undefined,
      at: request.paidAt,
      actorName: request.paidByName || 'Team Member',
    });
  }
  if (request.voidedAt && validTime(request.voidedAt)) {
    entries.push({ label: 'Marked void', detail: request.voidReason, at: request.voidedAt, actorName: request.voidedByName || 'Admin' });
  }
  return entries;
};

// What to show: the recorded log, or the rebuilt one for an older refund. Newest first.
export const getRefundActivity = (request: RefundForActivity): RefundActivityEntry[] => (
  (request.activityLog && request.activityLog.length > 0 ? request.activityLog : deriveRefundActivity(request))
    .filter((entry) => validTime(entry.at))
    .slice()
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
);

type MoneyFormatter = (amount: number) => string;

// The log to store after a save: everything already recorded (or rebuilt for an older refund), plus one entry for each
// thing that changed this time. Returns the existing log untouched when nothing meaningful changed.
export const nextRefundActivityLog = (
  previous: RefundForActivity,
  next: RefundForActivity,
  actorName: string,
  nowIso: string,
  formatMoney: MoneyFormatter
): RefundActivityEntry[] => {
  const base = previous.activityLog && previous.activityLog.length > 0 ? previous.activityLog : deriveRefundActivity(previous);
  const added: RefundActivityEntry[] = [];
  const actor = (preferred?: string) => (preferred && preferred.trim()) || actorName || 'Team Member';

  if (previous.status !== next.status) {
    switch (next.status) {
      case 'submitted':
        added.push({
          label: previous.status === 'draft' && isMoreInfo(previous.rejectionReason) ? 'Resubmitted for approval' : 'Submitted for approval',
          at: nowIso,
          actorName: actor(),
        });
        break;
      case 'approved':
        added.push({ label: 'Refund approved', at: nowIso, actorName: actor(next.reviewedByName) });
        break;
      case 'rejected':
        added.push({ label: 'Refund rejected', detail: next.rejectionReason || undefined, at: nowIso, actorName: actor(next.reviewedByName) });
        break;
      case 'paid':
        added.push({
          label: 'Refund paid',
          detail: next.paymentReference ? `Ref ${next.paymentReference}` : undefined,
          at: nowIso,
          actorName: actor(next.paidByName),
        });
        break;
      case 'void':
        added.push({ label: 'Marked void', detail: next.voidReason || undefined, at: nowIso, actorName: actor(next.voidedByName) });
        break;
      case 'draft':
        added.push({
          label: isMoreInfo(next.rejectionReason) ? 'More info requested' : 'Moved back to draft',
          detail: isMoreInfo(next.rejectionReason) ? (next.rejectionReason ?? '').replace(MORE_INFO_PREFIX, '') || undefined : undefined,
          at: nowIso,
          actorName: actor(next.reviewedByName),
        });
        break;
      default:
        break;
    }
  }

  // Edits to the request itself (not the status): amount, reason, note, type, bank charges and the context screenshots.
  const edits: string[] = [];
  if (previous.amount !== next.amount) edits.push(`Amount changed from ${formatMoney(previous.amount)} to ${formatMoney(next.amount)}`);
  if (previous.refundType !== next.refundType) edits.push(`Refund type changed to ${next.refundType === 'full' ? 'full' : 'partial'}`);
  if ((previous.reason ?? '').trim() !== (next.reason ?? '').trim()) edits.push('Reason updated');
  if ((previous.note ?? '').trim() !== (next.note ?? '').trim()) edits.push('Note updated');
  if (Boolean(previous.applyBankCharges) !== Boolean(next.applyBankCharges)) edits.push(next.applyBankCharges ? 'Bank charges applied' : 'Bank charges removed');
  if ((previous.attachments ?? []).length !== (next.attachments ?? []).length) edits.push('Screenshots updated');
  if (edits.length > 0) {
    added.push({ label: 'Request edited', detail: edits.join(' · '), at: nowIso, actorName: actor() });
  }

  return added.length === 0 ? base : [...base, ...added];
};

// The first entry of a refund that has just been created.
export const initialRefundActivityLog = (request: RefundForActivity, actorName: string, nowIso: string): RefundActivityEntry[] => [
  {
    label: request.status === 'draft' ? 'Draft created' : 'Refund requested',
    at: request.submittedAt || request.requestedDate || request.createdAt || nowIso,
    actorName: request.submittedByName || actorName || 'Team Member',
  },
];
