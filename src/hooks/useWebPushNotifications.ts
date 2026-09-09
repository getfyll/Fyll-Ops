import { useCallback } from 'react';
import { useOneSignal } from './useOneSignal';
import { supabase } from '@/lib/supabase';

declare global {
  interface Window {
    OneSignal?: any;
  }
}

type ThreadNotificationPayload = {
  type: 'thread_message';
  businessId: string;
  recipientUserIds: string[];
  senderUserId?: string | null;
  authorName: string;
  body: string;
  entityType?: string | null;
  entityDisplayName?: string | null;
  entityId?: string | null;
  threadId?: string | null;
  commentId?: string | null;
  isMention?: boolean;
  isEveryoneMention?: boolean;
};

type OrderNotificationPayload = {
  type: 'order_created';
  businessId: string;
  orderNumber: string;
  customerName: string;
  totalAmount: string;
  createdBy?: string;
};

type TaskAssignedNotificationPayload = {
  type: 'task_assigned';
  businessId: string;
  recipientUserIds: string[];
  senderUserId?: string | null;
  assignerName?: string | null;
  taskId: string;
  taskTitle: string;
  dueDate?: string | null;
  isReassignment?: boolean;
};

type TaskDueRemindersPayload = {
  type: 'task_due_reminders';
  businessId: string;
  reminderDate?: string | null;
};

type TaskEventRemindersPayload = {
  type: 'task_event_reminders';
  businessId: string;
  reminderIso?: string | null;
};

type TaskCompletedNotificationPayload = {
  type: 'task_completed';
  businessId: string;
  recipientUserIds: string[];
  senderUserId?: string | null;
  completedByName?: string | null;
  taskId: string;
  taskTitle: string;
  completedAt?: string | null;
};

type DirectSubscriptionTestPayload = {
  type: 'direct_subscription_test';
  businessId: string;
  subscriptionId: string;
  heading?: string | null;
  content?: string | null;
};

type PartnerJobDispatchedNotificationPayload = {
  type: 'partner_job_dispatched';
  businessId: string;
  partnerId: string;
  jobId: string;
  customerName?: string;
  itemLabel?: string;
};

type PartnerIssueReportedNotificationPayload = {
  type: 'partner_issue_reported';
  businessId: string;
  partnerId: string;
  jobId: string;
  issueId: string;
  customerName?: string;
  itemLabel?: string;
};

type PartnerIssueResolvedNotificationPayload = {
  type: 'partner_issue_resolved';
  businessId: string;
  partnerId: string;
  jobId: string;
  issueId: string;
  customerName?: string;
  itemLabel?: string;
};

type PartnerJobEventNotificationPayload = {
  type: 'partner_job_event';
  businessId: string;
  partnerToken?: string | null;
  jobId: string;
  event: 'accepted' | 'rejected' | 'bill_submitted' | 'status_updated';
  customerName?: string;
  itemLabel?: string;
  amount?: string;
  statusLabel?: string;
};

const invokeNotificationFunction = async (payload: Record<string, unknown>) => {
  // Explicitly get the current session token to avoid 401s when the client
  // hasn't auto-attached the JWT (e.g. on iOS PWA after a cold start).
  // Use getUser() which always validates against the server and returns a fresh token,
  // then fall back to getSession() to retrieve the access_token.
  let { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    const { data } = await supabase.auth.refreshSession();
    session = data.session;
  }
  const headers: Record<string, string> = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};

  const { data, error } = await supabase.functions.invoke('send-thread-notification', {
    body: payload,
    headers,
  });

  if (error) {
    let detailedMessage = error.message ?? 'Notification function failed';

    try {
      const context = (error as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } }).context;
      if (context?.json) {
        const body = await context.json();
        detailedMessage = typeof body === 'string' ? body : JSON.stringify(body);
      } else if (context?.text) {
        const bodyText = await context.text();
        if (bodyText) detailedMessage = bodyText;
      }
    } catch {
      // Fallback to generic error.message if response body can't be parsed
    }

    throw new Error(detailedMessage);
  }

  return data;
};

export function useWebPushNotifications() {
  const {
    isReady,
    loginOneSignalUser,
    logoutOneSignalUser,
    setOneSignalTag,
    getOneSignalDebugState,
    forceOneSignalResync,
  } = useOneSignal();

  const promptForPermission = useCallback(async () => {
    if (typeof window === 'undefined' || !isReady) return false;
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (granted: boolean) => {
        if (settled) return;
        settled = true;
        resolve(granted);
      };

      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async (OneSignal: any) => {
        try {
          await OneSignal.Notifications.requestPermission();
          finish(Boolean(OneSignal?.Notifications?.permission));
        } catch (err) {
          console.warn('[OneSignal] permission prompt error:', err);
          finish(false);
        }
      });

      setTimeout(() => finish(false), 8000);
    });
  }, [isReady]);

  const setUserTag = useCallback((key: string, value: string) => {
    if (typeof window === 'undefined' || !isReady) return;
    setOneSignalTag(key, value);
  }, [isReady, setOneSignalTag]);

  const tagWithBusinessId = useCallback((businessId: string) => {
    if (!businessId) return;
    setUserTag('business_id', businessId);
  }, [setUserTag]);

  const loginUser = useCallback((userId: string) => {
    if (!isReady || !userId) return;
    loginOneSignalUser(userId);
  }, [isReady, loginOneSignalUser]);

  const logoutUser = useCallback(() => {
    if (!isReady) return;
    logoutOneSignalUser();
  }, [isReady, logoutOneSignalUser]);

  const getDebugState = useCallback(async () => {
    if (!isReady) return null;
    return await getOneSignalDebugState();
  }, [getOneSignalDebugState, isReady]);

  const forceResync = useCallback(async () => {
    if (!isReady) return null;
    return await forceOneSignalResync();
  }, [forceOneSignalResync, isReady]);

  const sendDirectSubscriptionTest = useCallback(async (options: {
    businessId: string;
    subscriptionId: string;
    heading?: string;
    content?: string;
  }) => {
    const payload: DirectSubscriptionTestPayload = {
      type: 'direct_subscription_test',
      businessId: options.businessId.trim(),
      subscriptionId: options.subscriptionId.trim(),
      heading: options.heading ?? null,
      content: options.content ?? null,
    };
    return await invokeNotificationFunction(payload);
  }, []);

  return {
    isReady,
    promptForPermission,
    setUserTag,
    tagWithBusinessId,
    loginUser,
    logoutUser,
    getDebugState,
    forceResync,
    sendDirectSubscriptionTest,
  };
}

// Simple deduplication: track recently sent notification keys to avoid duplicates
const recentlySentKeys = new Set<string>();
const DEDUP_TTL_MS = 10_000; // 10 seconds

/**
 * Send a push notification for a new thread message/reply.
 * Targets specific users by their user_id tag, excluding the author.
 */
export async function sendThreadNotification(options: {
  businessId: string;
  recipientUserIds: string[];
  senderUserId?: string | null;
  authorName: string;
  body: string;
  entityType?: string | null;
  entityDisplayName?: string | null;
  entityId?: string | null;
  threadId?: string | null;
  commentId?: string | null;
  isMention?: boolean;
  isEveryoneMention?: boolean;
}): Promise<void> {
  const {
    businessId,
    recipientUserIds,
    senderUserId,
    authorName,
    body,
    entityType,
    entityDisplayName,
    entityId,
    threadId,
    commentId,
    isMention,
    isEveryoneMention,
  } = options;

  if (!businessId) {
    return;
  }

  // Filter out empty ids. Do not exclude the sender here: the same account may
  // be signed into multiple devices, and secondary devices should still receive
  // the thread push.
  const validRecipients = recipientUserIds
    .filter(Boolean)
    .map((id) => id.trim())
    .filter(Boolean);
  if (validRecipients.length === 0) return;

  // Deduplication: prevent the same notification from being sent twice within 10s
  const dedupKey = `${businessId}:${validRecipients.sort().join(',')}:${body.slice(0, 50)}:${isEveryoneMention ? 'e' : (isMention ? 'm' : 'r')}`;
  if (recentlySentKeys.has(dedupKey)) {
    console.log('OneSignal: Skipping duplicate thread notification');
    return;
  }
  recentlySentKeys.add(dedupKey);
  setTimeout(() => recentlySentKeys.delete(dedupKey), DEDUP_TTL_MS);

  const payload: ThreadNotificationPayload = {
    type: 'thread_message',
    businessId,
    recipientUserIds: validRecipients,
    senderUserId: senderUserId ?? null,
    authorName: authorName || 'A team member',
    body,
    entityType: entityType ?? null,
    entityDisplayName: entityDisplayName ?? null,
    entityId: entityId ?? null,
    threadId: threadId ?? null,
    commentId: commentId ?? null,
    isMention: Boolean(isMention),
    isEveryoneMention: Boolean(isEveryoneMention),
  };

  try {
    await invokeNotificationFunction(payload);
  } catch (error) {
    console.log('OneSignal thread notification error:', error);
  }
}

/**
 * Send a push notification to all users tagged with a specific businessId
 * through the authenticated backend notification function.
 */
export async function sendOrderNotification(options: {
  businessId: string;
  orderNumber: string;
  customerName: string;
  totalAmount: string;
  createdBy?: string;
}, config?: {
  throwOnError?: boolean;
}): Promise<void> {
  const { businessId, orderNumber, customerName, totalAmount, createdBy } = options;
  const throwOnError = config?.throwOnError ?? false;

  if (!businessId) {
    return;
  }

  const payload: OrderNotificationPayload = {
    type: 'order_created',
    businessId,
    orderNumber,
    customerName,
    totalAmount,
    createdBy,
  };

  try {
    await invokeNotificationFunction(payload);
  } catch (error) {
    console.log('OneSignal notification error:', error);
    if (throwOnError) {
      throw error;
    }
  }
}

/**
 * Send push notifications when users are newly assigned to a task.
 */
export async function sendTaskAssignmentNotification(options: {
  businessId: string;
  recipientUserIds: string[];
  senderUserId?: string | null;
  assignerName?: string | null;
  taskId: string;
  taskTitle: string;
  dueDate?: string | null;
  isReassignment?: boolean;
}): Promise<void> {
  const {
    businessId,
    recipientUserIds,
    senderUserId,
    assignerName,
    taskId,
    taskTitle,
    dueDate,
    isReassignment,
  } = options;

  if (!businessId || !taskId || !taskTitle.trim()) return;

  const senderNormalized = senderUserId?.trim().toLowerCase() ?? null;
  const recipients = Array.from(
    new Set(
      recipientUserIds
        .map((value) => value.trim())
        .filter(Boolean)
        .filter((id) => !senderNormalized || id.toLowerCase() !== senderNormalized)
    )
  );
  if (recipients.length === 0) return;

  const dedupKey = `task-assign:${businessId}:${taskId}:${recipients.slice().sort().join(',')}:${taskTitle.trim().toLowerCase()}:${dueDate ?? ''}:${isReassignment ? '1' : '0'}`;
  if (recentlySentKeys.has(dedupKey)) return;
  recentlySentKeys.add(dedupKey);
  setTimeout(() => recentlySentKeys.delete(dedupKey), DEDUP_TTL_MS);

  const payload: TaskAssignedNotificationPayload = {
    type: 'task_assigned',
    businessId,
    recipientUserIds: recipients,
    senderUserId: senderUserId ?? null,
    assignerName: assignerName ?? null,
    taskId,
    taskTitle: taskTitle.trim(),
    dueDate: dueDate ?? null,
    isReassignment: Boolean(isReassignment),
  };

  try {
    await invokeNotificationFunction(payload);
  } catch (error) {
    console.log('OneSignal task-assigned notification error:', error);
  }
}

/**
 * Send push notifications when a task is marked complete.
 */
export async function sendTaskCompletionNotification(options: {
  businessId: string;
  recipientUserIds: string[];
  senderUserId?: string | null;
  completedByName?: string | null;
  taskId: string;
  taskTitle: string;
  completedAt?: string | null;
}): Promise<void> {
  const {
    businessId,
    recipientUserIds,
    senderUserId,
    completedByName,
    taskId,
    taskTitle,
    completedAt,
  } = options;

  if (!businessId || !taskId || !taskTitle.trim()) return;

  const senderNormalized = senderUserId?.trim().toLowerCase() ?? null;
  const recipients = Array.from(
    new Set(
      recipientUserIds
        .map((value) => value.trim())
        .filter(Boolean)
        .filter((id) => !senderNormalized || id.toLowerCase() !== senderNormalized)
    )
  );
  if (recipients.length === 0) return;

  const dedupKey = `task-complete:${businessId}:${taskId}:${recipients.slice().sort().join(',')}:${taskTitle.trim().toLowerCase()}:${completedAt ?? ''}`;
  if (recentlySentKeys.has(dedupKey)) return;
  recentlySentKeys.add(dedupKey);
  setTimeout(() => recentlySentKeys.delete(dedupKey), DEDUP_TTL_MS);

  const payload: TaskCompletedNotificationPayload = {
    type: 'task_completed',
    businessId,
    recipientUserIds: recipients,
    senderUserId: senderUserId ?? null,
    completedByName: completedByName ?? null,
    taskId,
    taskTitle: taskTitle.trim(),
    completedAt: completedAt ?? null,
  };

  try {
    await invokeNotificationFunction(payload);
  } catch (error) {
    console.log('OneSignal task-completed notification error:', error);
  }
}

/**
 * Ask the backend to send due/overdue reminders for open tasks.
 * Safe to call repeatedly; the backend deduplicates reminders per task/user/day.
 */
export async function triggerTaskDueReminders(options: {
  businessId: string;
  reminderDate?: string | null;
}, config?: {
  throwOnError?: boolean;
}): Promise<Record<string, unknown> | null> {
  const { businessId, reminderDate } = options;
  const throwOnError = config?.throwOnError ?? false;
  if (!businessId) return null;

  const payload: TaskDueRemindersPayload = {
    type: 'task_due_reminders',
    businessId,
    reminderDate: reminderDate ?? null,
  };

  try {
    const result = await invokeNotificationFunction(payload);
    return (result ?? null) as Record<string, unknown> | null;
  } catch (error) {
    console.log('OneSignal task due reminder trigger error:', error);
    if (throwOnError) throw error;
    return null;
  }
}

/**
 * Ask the backend to send event reminders for soon/starting-now events.
 * Safe to call repeatedly; the backend deduplicates reminders per task/user/stage.
 */
export async function triggerTaskEventReminders(options: {
  businessId: string;
  reminderIso?: string | null;
}, config?: {
  throwOnError?: boolean;
}): Promise<Record<string, unknown> | null> {
  const { businessId, reminderIso } = options;
  const throwOnError = config?.throwOnError ?? false;
  if (!businessId) return null;

  const payload: TaskEventRemindersPayload = {
    type: 'task_event_reminders',
    businessId,
    reminderIso: reminderIso ?? null,
  };

  try {
    const result = await invokeNotificationFunction(payload);
    return (result ?? null) as Record<string, unknown> | null;
  } catch (error) {
    console.log('OneSignal task event reminder trigger error:', error);
    if (throwOnError) throw error;
    return null;
  }
}

/**
 * Sends a real test push to the currently signed-in user's own registered
 * Expo push tokens (native iOS/Android), via the authenticated backend path.
 * Used by the debug screen to verify native push delivery end-to-end.
 */
export async function sendExpoPushTest(): Promise<Record<string, unknown> | null> {
  return await invokeNotificationFunction({ type: 'expo_push_test' }) as Record<string, unknown> | null;
}

/**
 * Sends a real test push to the currently signed-in partner's own device,
 * from the partner portal's Account tab. Session-mode only — there's no
 * session to target for a magic-link (token-mode) partner.
 */
export async function sendPartnerTestPush(): Promise<Record<string, unknown> | null> {
  return await invokeNotificationFunction({ type: 'partner_test_push' }) as Record<string, unknown> | null;
}

/**
 * Push a business staff member's dispatched job to the partner, if the
 * partner has a linked account (session-mode). Token-only partners have no
 * session to push to — the accompanying job-dispatch email covers them.
 * Safe to call fire-and-forget; failures are swallowed.
 */
export async function sendPartnerJobDispatchedNotification(options: {
  businessId: string;
  partnerId: string;
  jobId: string;
  customerName?: string;
  itemLabel?: string;
}): Promise<void> {
  const { businessId, partnerId, jobId, customerName, itemLabel } = options;
  if (!businessId || !partnerId || !jobId) return;

  const payload: PartnerJobDispatchedNotificationPayload = {
    type: 'partner_job_dispatched',
    businessId,
    partnerId,
    jobId,
    customerName,
    itemLabel,
  };

  try {
    await invokeNotificationFunction(payload);
  } catch (error) {
    console.log('Partner job dispatched notification error:', error);
  }
}

/**
 * Push a business staff member's reported job issue to the partner, if the
 * partner has a linked account (session-mode). Fire-and-forget.
 */
export async function sendPartnerIssueReportedNotification(options: {
  businessId: string;
  partnerId: string;
  jobId: string;
  issueId: string;
  customerName?: string;
  itemLabel?: string;
}): Promise<void> {
  const { businessId, partnerId, jobId, issueId, customerName, itemLabel } = options;
  if (!businessId || !partnerId || !jobId || !issueId) return;

  const payload: PartnerIssueReportedNotificationPayload = {
    type: 'partner_issue_reported',
    businessId,
    partnerId,
    jobId,
    issueId,
    customerName,
    itemLabel,
  };

  try {
    await invokeNotificationFunction(payload);
  } catch (error) {
    console.log('Partner issue reported notification error:', error);
  }
}

/**
 * Push a business staff member's issue resolution to the partner, if the
 * partner has a linked account (session-mode). Fire-and-forget.
 */
export async function sendPartnerIssueResolvedNotification(options: {
  businessId: string;
  partnerId: string;
  jobId: string;
  issueId: string;
  customerName?: string;
  itemLabel?: string;
}): Promise<void> {
  const { businessId, partnerId, jobId, issueId, customerName, itemLabel } = options;
  if (!businessId || !partnerId || !jobId || !issueId) return;

  const payload: PartnerIssueResolvedNotificationPayload = {
    type: 'partner_issue_resolved',
    businessId,
    partnerId,
    jobId,
    issueId,
    customerName,
    itemLabel,
  };

  try {
    await invokeNotificationFunction(payload);
  } catch (error) {
    console.log('Partner issue resolved notification error:', error);
  }
}

/**
 * Notify business staff when a partner accepts/rejects a job or submits a
 * bill. Called from the partner portal, which has no business-staff
 * session — pass `partnerToken` for magic-link (token-mode) partners; a
 * signed-in (session-mode) partner's own auth token is attached
 * automatically. Safe to call fire-and-forget; failures are swallowed.
 */
export async function sendPartnerJobEventNotification(options: {
  businessId: string;
  partnerToken?: string | null;
  jobId: string;
  event: 'accepted' | 'rejected' | 'bill_submitted' | 'status_updated';
  customerName?: string;
  itemLabel?: string;
  amount?: string;
  statusLabel?: string;
}): Promise<void> {
  const { businessId, partnerToken, jobId, event, customerName, itemLabel, amount, statusLabel } = options;
  if (!businessId || !jobId || !event) return;

  const payload: PartnerJobEventNotificationPayload = {
    type: 'partner_job_event',
    businessId,
    partnerToken: partnerToken ?? null,
    jobId,
    event,
    customerName,
    itemLabel,
    amount,
    statusLabel,
  };

  try {
    await invokeNotificationFunction(payload);
  } catch (error) {
    console.log('Partner job event notification error:', error);
  }
}
