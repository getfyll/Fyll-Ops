import { sendPartnerIssueReportedNotification, sendPartnerIssueResolvedNotification, sendPartnerJobDispatchedNotification, sendPartnerJobEventNotification } from '@/hooks/useWebPushNotifications';

/**
 * Called by business staff right after a job is dispatched to a partner
 * (new job with auto-dispatch, or manually sending an "awaiting dispatch"
 * job). Pushes to the partner if they have a linked account (session-mode).
 * Fire-and-forget; failures are swallowed.
 */
export function notifyPartnerJobDispatched(options: {
  businessId: string;
  partnerId: string;
  jobId: string;
  customerName?: string;
  itemLabel?: string;
}): void {
  const { businessId, partnerId, jobId, customerName, itemLabel } = options;
  if (!businessId || !partnerId || !jobId) return;

  void sendPartnerJobDispatchedNotification({ businessId, partnerId, jobId, customerName, itemLabel });
}

/**
 * Called by business staff right after reporting a job issue (defect/
 * complaint). Pushes to the partner if they have a linked account.
 */
export function notifyPartnerOfIssue(options: {
  businessId: string;
  partnerId: string;
  jobId: string;
  issueId: string;
  customerName?: string;
  itemLabel?: string;
}): void {
  const { businessId, partnerId, jobId, issueId, customerName, itemLabel } = options;
  if (!businessId || !partnerId || !jobId || !issueId) return;

  void sendPartnerIssueReportedNotification({ businessId, partnerId, jobId, issueId, customerName, itemLabel });
}

/**
 * Called by business staff right after marking a job issue resolved.
 * Pushes to the partner if they have a linked account.
 */
export function notifyPartnerOfIssueResolved(options: {
  businessId: string;
  partnerId: string;
  jobId: string;
  issueId: string;
  customerName?: string;
  itemLabel?: string;
}): void {
  const { businessId, partnerId, jobId, issueId, customerName, itemLabel } = options;
  if (!businessId || !partnerId || !jobId || !issueId) return;

  void sendPartnerIssueResolvedNotification({ businessId, partnerId, jobId, issueId, customerName, itemLabel });
}

/**
 * Called from the partner portal when a partner accepts/rejects a job or
 * submits a bill. Notifies business staff via push + the in-app
 * notification bell. `partnerToken` is required for magic-link (token-mode)
 * partners; a signed-in partner's own session is used automatically
 * otherwise.
 */
export function notifyBusinessOfPartnerJobEvent(options: {
  businessId: string;
  partnerToken?: string | null;
  jobId: string;
  event: 'accepted' | 'rejected' | 'bill_submitted' | 'status_updated';
  customerName?: string;
  itemLabel?: string;
  amount?: string;
  statusLabel?: string;
}): void {
  const { businessId, partnerToken, jobId, event, customerName, itemLabel, amount, statusLabel } = options;
  if (!businessId || !jobId) return;

  void sendPartnerJobEventNotification({ businessId, partnerToken, jobId, event, customerName, itemLabel, amount, statusLabel });
}
