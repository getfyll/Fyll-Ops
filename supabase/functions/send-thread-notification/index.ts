import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sanitizeEnvValue = (value: string | undefined | null) => (
  (value ?? '')
    .normalize('NFKC')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
)

const ONESIGNAL_APP_ID = sanitizeEnvValue(Deno.env.get('ONESIGNAL_APP_ID'))
const ONESIGNAL_REST_API_KEY = sanitizeEnvValue(Deno.env.get('ONESIGNAL_REST_API_KEY'))
const PARTNER_ONESIGNAL_APP_ID = sanitizeEnvValue(Deno.env.get('PARTNER_ONESIGNAL_APP_ID'))
const PARTNER_ONESIGNAL_REST_API_KEY = sanitizeEnvValue(Deno.env.get('PARTNER_ONESIGNAL_REST_API_KEY'))
const SUPABASE_URL = sanitizeEnvValue(Deno.env.get('SUPABASE_URL'))
const SUPABASE_SERVICE_ROLE_KEY = sanitizeEnvValue(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
const ALLOWED_ORIGIN = sanitizeEnvValue(Deno.env.get('ALLOWED_ORIGIN')) || '*'
const CRON_SECRET = sanitizeEnvValue(Deno.env.get('CRON_SECRET'))

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ThreadMessagePayload = {
  type?: 'thread_message'
  businessId?: string
  recipientUserIds?: string[]
  senderUserId?: string | null
  authorName?: string
  body?: string
  entityType?: 'order' | 'case' | 'task' | null
  entityDisplayName?: string | null
  entityId?: string | null
  threadId?: string | null
  commentId?: string | null
  isMention?: boolean
  isEveryoneMention?: boolean
}

type OrderCreatedPayload = {
  type: 'order_created'
  businessId?: string
  orderNumber?: string
  customerName?: string
  totalAmount?: string
  createdBy?: string
}

type TaskAssignedPayload = {
  type: 'task_assigned'
  businessId?: string
  recipientUserIds?: string[]
  senderUserId?: string | null
  assignerName?: string | null
  taskId?: string
  taskTitle?: string
  dueDate?: string | null
  isReassignment?: boolean
}

type TaskDueRemindersPayload = {
  type: 'task_due_reminders'
  businessId?: string
  reminderDate?: string | null
}

type TaskEventRemindersPayload = {
  type: 'task_event_reminders'
  businessId?: string
  reminderIso?: string | null
}

type TaskCompletedPayload = {
  type: 'task_completed'
  businessId?: string
  recipientUserIds?: string[]
  senderUserId?: string | null
  completedByName?: string | null
  taskId?: string
  taskTitle?: string
  completedAt?: string | null
}

type DirectSubscriptionTestPayload = {
  type: 'direct_subscription_test'
  businessId?: string
  subscriptionId?: string
  heading?: string | null
  content?: string | null
}

type ExpoPushTestPayload = {
  type: 'expo_push_test'
  businessId?: string
}

// Fired by business staff (normal authenticated flow) right after dispatching
// a job to a partner. Pushes to the partner if they have a linked auth
// account (partners.auth_user_id) — token-only partners have no session to
// target, so this is a no-op for them (they still get the job-dispatch email).
type PartnerJobDispatchedPayload = {
  type: 'partner_job_dispatched'
  businessId?: string
  partnerId?: string
  jobId?: string
  customerName?: string
  itemLabel?: string
}

// Fired by business staff right after reporting a job issue (defect/
// complaint) against a job already dispatched to a partner.
type PartnerIssueReportedPayload = {
  type: 'partner_issue_reported'
  businessId?: string
  partnerId?: string
  jobId?: string
  issueId?: string
  customerName?: string
  itemLabel?: string
}

// Fired by business staff right after marking a job issue resolved —
// lets the partner know payment is no longer on hold.
type PartnerIssueResolvedPayload = {
  type: 'partner_issue_resolved'
  businessId?: string
  partnerId?: string
  jobId?: string
  issueId?: string
  customerName?: string
  itemLabel?: string
}

// Fired by the partner portal (no business-staff session exists) whenever a
// partner accepts/rejects a job or submits a bill. Authenticated the same
// way the partner-portal RPCs are: either a magic-link token or the
// partner's own Supabase Auth session — see resolvePartnerCaller below.
// Pushes to business staff and writes a row into collaboration_notifications
// so it also shows up in the business's in-app notification bell.
// Lets a signed-in (session-mode) partner send themselves a real push to
// confirm delivery is working, from the portal's Account tab. Token-only
// partners have no session for this to target, so the button is hidden
// for them client-side.
type PartnerTestPushPayload = {
  type: 'partner_test_push'
  businessId?: string
}

type PartnerJobEventPayload = {
  type: 'partner_job_event'
  businessId?: string
  partnerToken?: string | null
  jobId?: string
  event?: 'accepted' | 'rejected' | 'bill_submitted' | 'status_updated'
  customerName?: string
  itemLabel?: string
  amount?: string
  statusLabel?: string
}

// Fired by the public.orders AFTER INSERT trigger (see
// supabase/setup_storefront_order_notifications.sql) whenever a storefront
// order lands — no authenticated user session exists in that context, so
// this is dispatched via the CRON_SECRET bearer bypass, same as
// task_due_reminders_all below.
type StorefrontOrderCreatedPayload = {
  type: 'storefront_order_created'
  businessId?: string
  orderNumber?: string
  customerName?: string
  totalAmount?: string
  trackingCode?: string
}

type OrderDeliveryDetailsUpdatedPayload = {
  type: 'order_delivery_details_updated'
  businessId?: string
  orderNumber?: string
  customerName?: string
}

type PaymentReceivedPayload = {
  type: 'payment_received'
  businessId?: string
  paymentId?: string
  paymentReference?: string
  source?: string
  customerName?: string
  amount?: string
  status?: string
  paymentMethod?: string
  checkoutCode?: string
}

const jsonResponse = (status: number, body: Record<string, unknown>) => (
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
)

const getAdminClient = () => (
  createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
)

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.get('Authorization') ?? ''
  const [scheme, token] = authHeader.split(' ')
  if (scheme?.toLowerCase() !== 'bearer' || !token) return null
  return token
}

const truncate = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 3)}...`
}

const toUniqueIds = (ids: string[] | undefined | null) => {
  if (!Array.isArray(ids)) return []
  return Array.from(new Set(ids.map((id) => id?.trim()).filter((id): id is string => Boolean(id))))
}

const normalizeId = (value: string) => value.trim().toLowerCase()
const normalizeEmail = (value: string | null | undefined) => (value ?? '').trim().toLowerCase()
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TEAM_THREAD_ENTITY_PREFIX = '__team_thread__:'

const isTeamThreadEntityId = (value: string | null | undefined) => (
  typeof value === 'string' && value.startsWith(TEAM_THREAD_ENTITY_PREFIX)
)

const toTitleCase = (value: string) => value
  .split(/\s+/)
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
  .join(' ')

const getTeamThreadDisplayNameFromEntityId = (entityId: string | null | undefined) => {
  if (!isTeamThreadEntityId(entityId)) return 'Team Thread'
  const parts = (entityId as string).split(':')
  const rawSlug = parts[2] ? parts.slice(2).join(':') : parts[1] ?? ''
  const normalized = rawSlug.replace(/[-_]+/g, ' ').trim()
  if (!normalized) return 'Team Thread'
  return toTitleCase(normalized)
}

const getEntityDisplayName = async (
  admin: ReturnType<typeof getAdminClient>,
  businessId: string,
  entityType: 'order' | 'case' | 'task' | null,
  entityId: string | null,
) => {
  if (!entityType || !entityId) return ''

  if (entityType === 'order') {
    const { data } = await admin
      .from('orders')
      .select('data')
      .eq('business_id', businessId)
      .eq('id', entityId)
      .maybeSingle()

    const orderNumber = data?.data?.orderNumber
    if (typeof orderNumber === 'string' && orderNumber.trim()) {
      return `Order #${orderNumber.trim()}`
    }
  }

  if (entityType === 'case') {
    const { data } = await admin
      .from('cases')
      .select('data')
      .eq('business_id', businessId)
      .eq('id', entityId)
      .maybeSingle()

    const caseNumber = data?.data?.caseNumber
    if (typeof caseNumber === 'string' && caseNumber.trim()) {
      return `Case #${caseNumber.trim()}`
    }

    const issueSummary = data?.data?.issueSummary
    if (typeof issueSummary === 'string' && issueSummary.trim()) {
      return `Case: ${issueSummary.trim()}`
    }
  }

  if (entityType === 'task') {
    const { data } = await admin
      .from('tasks')
      .select('title')
      .eq('business_id', businessId)
      .eq('id', entityId)
      .maybeSingle()

    const title = data?.title
    if (typeof title === 'string' && title.trim()) {
      return `Task: ${title.trim()}`
    }
  }

  return ''
}

const listBusinessRecipientIds = async (
  admin: ReturnType<typeof getAdminClient>,
  businessId: string,
): Promise<string[]> => {
  const recipientIds = new Set<string>()

  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('business_id', businessId)

  if (profileError) {
    throw new Error('Could not load business recipients from profiles.')
  }

  ;(profiles ?? []).forEach((row: { id: string }) => {
    if (row.id?.trim()) recipientIds.add(row.id.trim())
  })

  const { data: teamMembers, error: teamMembersError } = await admin
    .from('team_members')
    .select('user_id')
    .eq('business_id', businessId)

  if (teamMembersError) {
    console.warn('Thread recipient fallback team_members lookup failed:', teamMembersError)
  } else {
    ;(teamMembers ?? []).forEach((row: { user_id: string }) => {
      if (row.user_id?.trim()) recipientIds.add(row.user_id.trim())
    })
  }

  return Array.from(recipientIds)
}

// Mirrors the auth branch used by every partner-portal RPC (see
// supabase/migrations/20260831010000_partner_accounts.sql): a magic-link
// token, or — when the caller has a real Supabase Auth session — the
// partner row whose auth_user_id matches the bearer token's user. Returns
// null if neither resolves to a partner in this business.
const resolvePartnerCaller = async (
  admin: ReturnType<typeof getAdminClient>,
  businessId: string,
  partnerToken: string | null | undefined,
  bearerToken: string | null,
): Promise<{ id: string; business_id: string; data: Record<string, unknown> } | null> => {
  const trimmedToken = (partnerToken ?? '').trim()

  if (trimmedToken) {
    const { data } = await admin
      .from('partners')
      .select('id,business_id,data')
      .eq('business_id', businessId)
      .filter('data->>magicLinkToken', 'eq', trimmedToken)
      .maybeSingle()
    return (data as { id: string; business_id: string; data: Record<string, unknown> } | null) ?? null
  }

  if (bearerToken) {
    const { data: authData } = await admin.auth.getUser(bearerToken)
    const authUserId = authData?.user?.id
    if (authUserId) {
      const { data } = await admin
        .from('partners')
        .select('id,business_id,data')
        .eq('business_id', businessId)
        .eq('auth_user_id', authUserId)
        .maybeSingle()
      return (data as { id: string; business_id: string; data: Record<string, unknown> } | null) ?? null
    }
  }

  return null
}

const sendOneSignalNotification = async ({
  recipients,
  heading,
  content,
  data,
  idempotencyKey,
  collapseId,
  channel = 'main',
}: {
  recipients: string[]
  heading: string
  content: string
  data: Record<string, unknown>
  idempotencyKey?: string
  collapseId?: string
  channel?: 'main' | 'partner'
}) => {
  const appId = channel === 'partner' && PARTNER_ONESIGNAL_APP_ID && PARTNER_ONESIGNAL_REST_API_KEY
    ? PARTNER_ONESIGNAL_APP_ID
    : ONESIGNAL_APP_ID
  const restApiKey = channel === 'partner' && PARTNER_ONESIGNAL_APP_ID && PARTNER_ONESIGNAL_REST_API_KEY
    ? PARTNER_ONESIGNAL_REST_API_KEY
    : ONESIGNAL_REST_API_KEY
  const isV2Key = restApiKey.startsWith('os_v2_')
  const authHeader = isV2Key
    ? `Key ${restApiKey}`
    : `Basic ${restApiKey}`

  const requestOneSignal = async (
    payload: Record<string, unknown>,
    mode: 'alias' | 'legacy' | 'tag',
  ) => {
    const controller = new AbortController()
    const timeoutMs = 12000
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      })

      const result = await response.json().catch(() => ({}))
      return {
        ok: response.ok,
        result,
        status: response.status,
        mode,
      }
    } catch (error) {
      const timeoutError = error instanceof Error && error.name === 'AbortError'
      return {
        ok: false,
        result: {
          error: timeoutError
            ? `OneSignal ${mode} request timed out after ${timeoutMs}ms`
            : (error instanceof Error ? error.message : String(error)),
        },
        status: 0,
        mode,
      }
    } finally {
      clearTimeout(timeoutId)
    }
  }

  const sharedPayload: Record<string, unknown> = {
    app_id: appId,
    contents: { en: content },
    headings: { en: heading },
    data,
  }
  const validIdempotencyKey = idempotencyKey && UUID_REGEX.test(idempotencyKey)
    ? idempotencyKey
    : undefined
  if (validIdempotencyKey) {
    sharedPayload.idempotency_key = validIdempotencyKey
  }

  // collapse_id tells browsers to replace an existing notification with
  // the same key instead of stacking duplicates (helps when a user has
  // multiple push subscriptions registered, e.g. several browser tabs).
  if (collapseId) {
    sharedPayload.collapse_id = collapseId
  }

  // Primary: alias method (fast, single API call for all recipients)
  const aliasPayload: Record<string, unknown> = {
    ...sharedPayload,
    include_aliases: { external_id: recipients },
    target_channel: 'push',
  }
  const aliasAttempt = await requestOneSignal(aliasPayload, 'alias')
  const aliasRecipients = typeof (aliasAttempt.result as { recipients?: unknown })?.recipients === 'number'
    ? ((aliasAttempt.result as { recipients?: number }).recipients ?? 0)
    : null
  const aliasHasInvalidAliases = Boolean((aliasAttempt.result as { errors?: { invalid_aliases?: unknown } })?.errors?.invalid_aliases)
  if (aliasAttempt.ok && !aliasHasInvalidAliases && (aliasRecipients === null || aliasRecipients > 0)) {
    return aliasAttempt.result
  }

  // Fallback: tag-based delivery per recipient (more reliable for this app's subscription model).
  const tagSuccesses: Array<{ recipient: string; result: unknown }> = []
  const tagFailures: Array<{ recipient: string; status: number; result: unknown }> = []

  for (const recipient of recipients) {
    const perRecipientPayload: Record<string, unknown> = {
      ...sharedPayload,
      filters: [
        { field: 'tag', key: 'user_id', relation: '=', value: recipient },
      ],
      target_channel: 'push',
    }

    const tagAttempt = await requestOneSignal(perRecipientPayload, 'tag')
    const tagRecipients = typeof (tagAttempt.result as { recipients?: unknown })?.recipients === 'number'
      ? ((tagAttempt.result as { recipients?: number }).recipients ?? 0)
      : null

    if (tagAttempt.ok && (tagRecipients === null || tagRecipients > 0)) {
      tagSuccesses.push({ recipient, result: tagAttempt.result })
    } else {
      tagFailures.push({ recipient, status: tagAttempt.status, result: tagAttempt.result })
    }
  }

  if (tagSuccesses.length > 0) {
    console.warn('OneSignal alias/legacy delivery failed, user_id tag fallback partially succeeded.', {
      deliveredCount: tagSuccesses.length,
      failedCount: tagFailures.length,
    })
    return {
      mode: 'tag_fallback',
      deliveredCount: tagSuccesses.length,
      failedCount: tagFailures.length,
    }
  }

  const isZeroRecipientResult = (value: unknown) => {
    if (!value || typeof value !== 'object') return false
    const recipientsValue = (value as { recipients?: unknown }).recipients
    return typeof recipientsValue === 'number' && recipientsValue === 0
  }

  const aliasWasZeroRecipients = aliasAttempt.ok && isZeroRecipientResult(aliasAttempt.result)
  const tagWasZeroRecipients = tagFailures.length === recipients.length
    && tagFailures.every((failure) => failure.status === 200 && isZeroRecipientResult(failure.result))

  if (aliasWasZeroRecipients && tagWasZeroRecipients) {
    // Recipients have no active push subscription — not an error, just no push delivery.
    console.warn('OneSignal: no subscribed recipients found, skipping push delivery.', { recipients })
    return { mode: 'no_subscribers', deliveredCount: 0, failedCount: 0 }
  }

  console.error('OneSignal delivery failed', {
    aliasStatus: aliasAttempt.status,
    aliasResult: aliasAttempt.result,
    tagFailures,
  })

  // Don't throw — push delivery failure shouldn't block in-app notifications.
  return { mode: 'failed', deliveredCount: 0, failedCount: recipients.length }
}

// Delivers push notifications to the native iOS/Android app via Expo's push
// service, for recipients who have registered a device in expo_push_tokens.
// This runs alongside OneSignal (web) so team members get alerts on whichever
// surface — browser or phone — they actually use.
const sendExpoPushNotifications = async (
  recipients: string[],
  heading: string,
  content: string,
  data: Record<string, unknown>,
) => {
  if (recipients.length === 0) return { sent: 0 }

  try {
    const admin = getAdminClient()
    const { data: tokenRows, error } = await admin
      .from('expo_push_tokens')
      .select('expo_push_token')
      .in('user_id', recipients)

    if (error) {
      console.warn('Expo push token lookup failed:', error)
      return { sent: 0 }
    }

    const tokens = Array.from(new Set(
      (tokenRows ?? [])
        .map((row: { expo_push_token: string }) => row.expo_push_token)
        .filter((token: string): token is string => typeof token === 'string' && token.length > 0)
    ))
    if (tokens.length === 0) return { sent: 0 }

    const messages = tokens.map((token) => ({
      to: token,
      sound: 'default',
      title: heading,
      body: content,
      data,
    }))

    let sent = 0
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100)
      try {
        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
          },
          body: JSON.stringify(chunk),
        })
        if (response.ok) {
          sent += chunk.length
        } else {
          console.error('Expo push send failed', response.status, await response.text().catch(() => ''))
        }
      } catch (chunkError) {
        console.error('Expo push send error:', chunkError)
      }
    }

    return { sent }
  } catch (err) {
    console.error('Expo push delivery error:', err)
    return { sent: 0 }
  }
}

// Fans a notification out to both OneSignal (web push) and Expo (native
// iOS/Android push) so every recipient is reached regardless of which
// surface they use. Callers should invoke this instead of calling
// sendOneSignalNotification directly.
const sendPushNotification = async (args: {
  recipients: string[]
  heading: string
  content: string
  data: Record<string, unknown>
  idempotencyKey?: string
  collapseId?: string
  channel?: 'main' | 'partner'
}) => {
  const [oneSignalResult] = await Promise.all([
    sendOneSignalNotification(args),
    sendExpoPushNotifications(args.recipients, args.heading, args.content, args.data),
  ])
  return oneSignalResult
}

const sendOneSignalDirectSubscriptionNotification = async ({
  subscriptionId,
  heading,
  content,
  data,
}: {
  subscriptionId: string
  heading: string
  content: string
  data: Record<string, unknown>
}) => {
  const isV2Key = ONESIGNAL_REST_API_KEY.startsWith('os_v2_')
  const authHeader = isV2Key
    ? `Key ${ONESIGNAL_REST_API_KEY}`
    : `Basic ${ONESIGNAL_REST_API_KEY}`

  const response = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      include_subscription_ids: [subscriptionId],
      target_channel: 'push',
      headings: { en: heading },
      contents: { en: content },
      data,
    }),
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    console.error('OneSignal direct subscription delivery failed', {
      subscriptionId,
      status: response.status,
      result,
    })
    return { mode: 'failed', status: response.status, result }
  }

  console.log('OneSignal direct subscription delivery result', {
    subscriptionId,
    status: response.status,
    result,
  })
  return { mode: 'direct_subscription', status: response.status, result }
}

const sendBusinessWideOrderNotification = async (
  admin: ReturnType<typeof getAdminClient>,
  businessId: string,
  orderNumber: string,
  customerName: string,
  totalAmount: string,
  createdBy?: string,
  excludeUserId?: string | null,
) => {
  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('business_id', businessId)

  if (profileError) {
    throw new Error('Could not load business recipients.')
  }

  const recipients = toUniqueIds(
    (profiles ?? [])
      .map((row: { id: string }) => row.id)
      .filter((id: string) => {
        if (!excludeUserId) return true
        return normalizeId(id) !== normalizeId(excludeUserId)
      }),
  )

  if (recipients.length === 0) {
    return { message: 'No business recipients.' }
  }

  const heading = `New Order #${orderNumber}`
  const content = `${customerName || 'Walk-in'} — ${totalAmount}${createdBy ? ` (by ${createdBy})` : ''}`
  return await sendPushNotification({
    recipients,
    heading,
    content,
    data: {
      type: 'order_created',
      businessId,
      orderNumber,
    },
    idempotencyKey: `order:${businessId}:${orderNumber}`,
    collapseId: `order:${orderNumber}`,
  })
}

const formatPaymentAmount = (value?: string) => {
  const trimmed = (value ?? '').trim()
  const amount = Number(trimmed)
  if (!Number.isFinite(amount)) return trimmed || '0'
  return `₦${amount.toLocaleString('en-US')}`
}

const notifyStorefrontOrder = async (
  admin: ReturnType<typeof getAdminClient>,
  businessId: string,
  orderNumber: string,
  customerName: string,
  totalAmount: string,
  trackingCode?: string,
) => {
  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('business_id', businessId)

  if (profileError) {
    throw new Error('Could not load business recipients.')
  }

  const recipients = toUniqueIds((profiles ?? []).map((row: { id: string }) => row.id))

  const notificationPayload = {
    type: 'storefront_order_created' as const,
    businessId,
    orderNumber,
    customerName,
    totalAmount,
    trackingCode: trackingCode ?? null,
  }

  if (recipients.length > 0) {
    const rows = recipients.map((recipientUserId) => ({
      business_id: businessId,
      user_id: recipientUserId,
      actor_user_id: null,
      thread_id: null,
      event_type: 'reply' as const,
      payload: notificationPayload,
    }))

    const { error: insertError } = await admin
      .from('collaboration_notifications')
      .insert(rows)

    if (insertError) {
      throw new Error('Could not persist storefront order in-app notifications.')
    }
  }

  if (recipients.length === 0) {
    return { message: 'No business recipients.' }
  }

  const heading = `🎉 New storefront order`
  const content = `New order · ${formatPaymentAmount(totalAmount)} on Fyll storefront`
  return await sendPushNotification({
    recipients,
    heading,
    content,
    data: notificationPayload,
    idempotencyKey: `storefront-order:${businessId}:${orderNumber}`,
    collapseId: `order:${orderNumber}`,
  })
}

const notifyOrderDeliveryDetailsUpdated = async (
  admin: ReturnType<typeof getAdminClient>,
  businessId: string,
  orderNumber: string,
  customerName: string,
) => {
  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id')
    .eq('business_id', businessId)

  if (profileError) {
    throw new Error('Could not load business recipients.')
  }

  const recipients = toUniqueIds((profiles ?? []).map((row: { id: string }) => row.id))

  const notificationPayload = {
    type: 'order_delivery_details_updated' as const,
    businessId,
    orderNumber,
    customerName,
  }

  if (recipients.length > 0) {
    const rows = recipients.map((recipientUserId) => ({
      business_id: businessId,
      user_id: recipientUserId,
      actor_user_id: null,
      thread_id: null,
      event_type: 'reply' as const,
      payload: notificationPayload,
    }))

    const { error: insertError } = await admin
      .from('collaboration_notifications')
      .insert(rows)

    if (insertError) {
      throw new Error('Could not persist delivery-details-updated in-app notifications.')
    }
  }

  if (recipients.length === 0) {
    return { message: 'No business recipients.' }
  }

  const heading = `📦 Delivery details updated`
  const content = `${customerName || 'A customer'} updated the delivery details for order #${orderNumber}`
  return await sendPushNotification({
    recipients,
    heading,
    content,
    data: notificationPayload,
    idempotencyKey: `order-delivery-details:${businessId}:${orderNumber}:${Date.now()}`,
    collapseId: `order:${orderNumber}`,
  })
}

const formatPaymentSourceLabel = (source?: string) => {
  const normalized = (source ?? '').trim().toLowerCase()
  if (normalized === 'fyll_checkout') return 'Fyll Checkout'
  if (normalized === 'storefront') return 'Storefront'
  if (normalized === 'social_checkout') return 'Social Checkout'
  return source?.trim() || 'Payment'
}

const notifyPaymentReceived = async (
  admin: ReturnType<typeof getAdminClient>,
  payload: PaymentReceivedPayload,
) => {
  const businessId = typeof payload.businessId === 'string' ? payload.businessId.trim() : ''
  const paymentReference = typeof payload.paymentReference === 'string' ? payload.paymentReference.trim() : ''
  if (!businessId || !paymentReference) {
    throw new Error('Missing businessId or paymentReference.')
  }

  const recipients = await listBusinessRecipientIds(admin, businessId)
  const notificationPayload = {
    type: 'payment_received' as const,
    businessId,
    paymentId: typeof payload.paymentId === 'string' ? payload.paymentId.trim() : '',
    paymentReference,
    source: typeof payload.source === 'string' ? payload.source.trim() : '',
    sourceLabel: formatPaymentSourceLabel(payload.source),
    customerName: typeof payload.customerName === 'string' ? payload.customerName.trim() : '',
    amount: formatPaymentAmount(typeof payload.amount === 'string' ? payload.amount : '0'),
    status: typeof payload.status === 'string' ? payload.status.trim() : '',
    paymentMethod: typeof payload.paymentMethod === 'string' ? payload.paymentMethod.trim() : '',
    checkoutCode: typeof payload.checkoutCode === 'string' ? payload.checkoutCode.trim() : '',
  }

  if (recipients.length > 0) {
    const rows = recipients.map((recipientUserId) => ({
      business_id: businessId,
      user_id: recipientUserId,
      actor_user_id: null,
      thread_id: null,
      event_type: 'reply' as const,
      payload: notificationPayload,
    }))

    const { error: insertError } = await admin
      .from('collaboration_notifications')
      .insert(rows)

    if (insertError) {
      throw new Error('Could not persist payment in-app notifications.')
    }
  }

  if (recipients.length === 0) {
    return { message: 'No business recipients.' }
  }

  const sourceLabel = notificationPayload.sourceLabel
  const heading = `New ${sourceLabel} payment`
  const content = `${notificationPayload.customerName || 'A customer'} paid ${notificationPayload.amount} — ${paymentReference}`
  const collapseId = `payment:${businessId}:${paymentReference}:${notificationPayload.status || 'received'}`

  return await sendPushNotification({
    recipients,
    heading,
    content,
    data: notificationPayload,
    idempotencyKey: collapseId,
    collapseId,
  })
}

const resolveReminderDate = (rawValue: string | null | undefined) => {
  const trimmed = (rawValue ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  return new Date().toISOString().slice(0, 10)
}

const getOrCreateTaskThreadId = async (
  admin: ReturnType<typeof getAdminClient>,
  businessId: string,
  taskId: string,
  actorUserId: string,
) => {
  const { data: existingThread, error: existingThreadError } = await admin
    .from('collaboration_threads')
    .select('id')
    .eq('business_id', businessId)
    .eq('entity_type', 'task')
    .eq('entity_id', taskId)
    .maybeSingle()

  if (existingThreadError) {
    throw new Error('Could not load task thread for notifications.')
  }

  if (existingThread?.id) return existingThread.id

  const { data: insertedThread, error: insertedThreadError } = await admin
    .from('collaboration_threads')
    .insert({
      business_id: businessId,
      entity_type: 'task',
      entity_id: taskId,
      created_by: actorUserId,
    })
    .select('id')
    .single()

  if (!insertedThreadError && insertedThread?.id) {
    return insertedThread.id
  }

  // Handle race where another request created the same thread.
  const { data: retriedThread, error: retriedThreadError } = await admin
    .from('collaboration_threads')
    .select('id')
    .eq('business_id', businessId)
    .eq('entity_type', 'task')
    .eq('entity_id', taskId)
    .maybeSingle()

  if (retriedThreadError || !retriedThread?.id) {
    throw new Error('Could not create task thread for notifications.')
  }

  return retriedThread.id
}

const persistTaskInAppNotifications = async ({
  admin,
  businessId,
  taskId,
  actorUserId,
  recipientUserIds,
  payload,
}: {
  admin: ReturnType<typeof getAdminClient>
  businessId: string
  taskId: string
  actorUserId: string
  recipientUserIds: string[]
  payload: Record<string, unknown>
}) => {
  const recipients = toUniqueIds(recipientUserIds)
  if (recipients.length === 0) return

  const threadId = await getOrCreateTaskThreadId(admin, businessId, taskId, actorUserId)
  const rows = recipients.map((recipientUserId) => ({
    business_id: businessId,
    user_id: recipientUserId,
    actor_user_id: actorUserId,
    thread_id: threadId,
    event_type: 'reply',
    payload,
  }))

  const { error } = await admin
    .from('collaboration_notifications')
    .insert(rows)

  if (error) {
    throw new Error('Could not persist task in-app notifications.')
  }
}

const sendTaskAssignmentNotification = async ({
  businessId,
  recipients,
  taskId,
  taskTitle,
  dueDate,
  assignerName,
  isReassignment,
}: {
  businessId: string
  recipients: string[]
  taskId: string
  taskTitle: string
  dueDate?: string | null
  assignerName?: string | null
  isReassignment?: boolean
}) => {
  const heading = isReassignment ? 'Task reassigned to you' : 'New task assigned to you'
  const title = taskTitle.trim() || 'Untitled task'
  const dueText = dueDate && /^\d{4}-\d{2}-\d{2}$/.test(dueDate)
    ? ` • Due ${dueDate}`
    : ''
  const actor = assignerName?.trim()
    ? (
      isReassignment
        ? `${assignerName.trim()} reassigned a task to you`
        : `${assignerName.trim()} assigned a new task to you`
    )
    : (
      isReassignment
        ? 'A task was reassigned to you'
        : 'A new task was assigned to you'
    );
  const content = `${actor}: ${truncate(title, 80)}${dueText}`
  const dedupeKeyBase = `task-assigned:${taskId}:${isReassignment ? 'reassigned' : 'new'}:${dueDate ?? 'none'}`

  return await sendPushNotification({
    recipients,
    heading,
    content,
    data: {
      type: 'task_assigned',
      businessId,
      taskId,
      dueDate: dueDate ?? null,
      isReassignment: Boolean(isReassignment),
    },
    idempotencyKey: `${dedupeKeyBase}:${recipients.slice().sort().join(',')}`,
    collapseId: dedupeKeyBase,
  })
}

const sendTaskCompletedNotification = async ({
  businessId,
  recipients,
  taskId,
  taskTitle,
  completedByName,
  completedAt,
}: {
  businessId: string
  recipients: string[]
  taskId: string
  taskTitle: string
  completedByName?: string | null
  completedAt?: string | null
}) => {
  const heading = 'Task completed'
  const title = taskTitle.trim() || 'Untitled task'
  const actor = completedByName?.trim() ? `${completedByName.trim()} completed` : 'Completed'
  const completedText = completedAt && /^\d{4}-\d{2}-\d{2}/.test(completedAt)
    ? ` • ${completedAt.slice(0, 10)}`
    : ''
  const content = `${actor}: ${truncate(title, 80)}${completedText}`
  const dedupeKeyBase = `task-completed:${taskId}:${completedAt ?? 'none'}`

  return await sendPushNotification({
    recipients,
    heading,
    content,
    data: {
      type: 'task_completed',
      businessId,
      taskId,
      completedAt: completedAt ?? null,
    },
    idempotencyKey: `${dedupeKeyBase}:${recipients.slice().sort().join(',')}`,
    collapseId: dedupeKeyBase,
  })
}

const sendPartnerJobDispatchedNotification = async ({
  admin,
  businessId,
  partnerId,
  jobId,
  businessName,
  customerName,
  itemLabel,
}: {
  admin: ReturnType<typeof getAdminClient>
  businessId: string
  partnerId: string
  jobId: string
  businessName: string
  customerName: string
  itemLabel: string
}) => {
  const { data: partnerRow } = await admin
    .from('partners')
    .select('id,auth_user_id')
    .eq('id', partnerId)
    .eq('business_id', businessId)
    .maybeSingle()

  const partnerAuthUserId = (partnerRow as { auth_user_id: string | null } | null)?.auth_user_id
  if (!partnerAuthUserId) {
    // Token-only partner — no session to push to.
    return { mode: 'no_partner_session', deliveredCount: 0 }
  }

  const heading = `New job from ${businessName}`
  const content = `${customerName} • ${itemLabel}`
  const dedupeKeyBase = `partner-job-dispatched:${jobId}`

  return await sendPushNotification({
    recipients: [partnerAuthUserId],
    heading,
    content,
    data: { type: 'partner_job_dispatched', businessId, partnerId, jobId },
    idempotencyKey: `${dedupeKeyBase}:${partnerAuthUserId}`,
    collapseId: dedupeKeyBase,
    channel: 'partner',
  })
}

const sendPartnerIssueReportedNotification = async ({
  admin,
  businessId,
  partnerId,
  jobId,
  issueId,
  businessName,
  customerName,
  itemLabel,
}: {
  admin: ReturnType<typeof getAdminClient>
  businessId: string
  partnerId: string
  jobId: string
  issueId: string
  businessName: string
  customerName: string
  itemLabel: string
}) => {
  const { data: partnerRow } = await admin
    .from('partners')
    .select('id,auth_user_id')
    .eq('id', partnerId)
    .eq('business_id', businessId)
    .maybeSingle()

  const partnerAuthUserId = (partnerRow as { auth_user_id: string | null } | null)?.auth_user_id
  if (!partnerAuthUserId) {
    // Token-only partner — no session to push to.
    return { mode: 'no_partner_session', deliveredCount: 0 }
  }

  const heading = `${businessName} reported an issue`
  const content = `${customerName} • ${itemLabel} — payment on hold until resolved`
  const dedupeKeyBase = `partner-issue-reported:${issueId}`

  return await sendPushNotification({
    recipients: [partnerAuthUserId],
    heading,
    content,
    data: { type: 'partner_issue_reported', businessId, partnerId, jobId, issueId },
    idempotencyKey: `${dedupeKeyBase}:${partnerAuthUserId}`,
    collapseId: dedupeKeyBase,
    channel: 'partner',
  })
}

const sendPartnerIssueResolvedNotification = async ({
  admin,
  businessId,
  partnerId,
  jobId,
  issueId,
  businessName,
  customerName,
  itemLabel,
}: {
  admin: ReturnType<typeof getAdminClient>
  businessId: string
  partnerId: string
  jobId: string
  issueId: string
  businessName: string
  customerName: string
  itemLabel: string
}) => {
  const { data: partnerRow } = await admin
    .from('partners')
    .select('id,auth_user_id')
    .eq('id', partnerId)
    .eq('business_id', businessId)
    .maybeSingle()

  const partnerAuthUserId = (partnerRow as { auth_user_id: string | null } | null)?.auth_user_id
  if (!partnerAuthUserId) {
    // Token-only partner — no session to push to.
    return { mode: 'no_partner_session', deliveredCount: 0 }
  }

  const heading = `${businessName} resolved an issue`
  const content = `${customerName} • ${itemLabel} — payment is no longer on hold`
  const dedupeKeyBase = `partner-issue-resolved:${issueId}`

  return await sendPushNotification({
    recipients: [partnerAuthUserId],
    heading,
    content,
    data: { type: 'partner_issue_resolved', businessId, partnerId, jobId, issueId },
    idempotencyKey: `${dedupeKeyBase}:${partnerAuthUserId}`,
    collapseId: dedupeKeyBase,
    channel: 'partner',
  })
}

const notifyBusinessOfPartnerEvent = async ({
  admin,
  businessId,
  partnerId,
  partnerName,
  jobId,
  event,
  customerName,
  itemLabel,
  amount,
  statusLabel,
}: {
  admin: ReturnType<typeof getAdminClient>
  businessId: string
  partnerId: string
  partnerName: string
  jobId: string
  event: 'accepted' | 'rejected' | 'bill_submitted' | 'status_updated'
  customerName: string
  itemLabel: string
  amount?: string
  statusLabel?: string
}) => {
  const recipients = await listBusinessRecipientIds(admin, businessId)
  if (recipients.length === 0) return { mode: 'no_recipients', deliveredCount: 0 }

  const heading = event === 'accepted'
    ? `${partnerName} accepted a job`
    : event === 'rejected'
      ? `${partnerName} rejected a job`
      : event === 'bill_submitted'
        ? `${partnerName} submitted a bill`
        : `${partnerName} updated a job to ${statusLabel || 'a new status'}`
  const content = event === 'bill_submitted' && amount
    ? `${customerName} • ${itemLabel} • ₦${amount}`
    : `${customerName} • ${itemLabel}`
  // For status_updated, event alone doesn't disambiguate which status —
  // fold statusLabel into the dedupe key so successive different statuses
  // on the same job each notify instead of collapsing into one.
  const dedupeKeyBase = event === 'status_updated'
    ? `partner-job-event:${jobId}:${event}:${statusLabel || ''}`
    : `partner-job-event:${jobId}:${event}`

  const [pushResult] = await Promise.all([
    sendPushNotification({
      recipients,
      heading,
      content,
      data: { type: 'partner_job_event', businessId, partnerId, jobId, event },
      idempotencyKey: `${dedupeKeyBase}:${recipients.slice().sort().join(',')}`,
      collapseId: dedupeKeyBase,
    }),
    // event_type has a check constraint allowing only 'mention' | 'reply' —
    // reuse 'reply' (same as task notifications) and keep the real partner
    // event type inside payload for the bell UI to read.
    admin.from('collaboration_notifications').insert(
      recipients.map((recipientUserId) => ({
        business_id: businessId,
        user_id: recipientUserId,
        event_type: 'reply',
        payload: { type: 'partner_job_event', heading, content, partnerId, jobId, partnerEvent: event },
      }))
    ),
  ])

  return pushResult
}

const sendTaskDueReminders = async (
  admin: ReturnType<typeof getAdminClient>,
  businessId: string,
  reminderDateInput?: string | null,
) => {
  const reminderDate = resolveReminderDate(reminderDateInput)
  const { data: dueTasks, error: dueTasksError } = await admin
    .from('tasks')
    .select('id, title, due_date, status')
    .eq('business_id', businessId)
    .lte('due_date', reminderDate)
    .in('status', ['todo', 'in_progress'])

  if (dueTasksError) {
    throw new Error('Could not load due/overdue tasks for reminders.')
  }

  const taskRows = (dueTasks ?? []) as Array<{
    id: string
    title?: string | null
    due_date?: string | null
    status?: string | null
  }>
  if (taskRows.length === 0) {
    return {
      success: true,
      reminderDate,
      dueTaskCount: 0,
      dueTodayTaskCount: 0,
      overdueTaskCount: 0,
      notifiedRecipients: 0,
      sentTaskCount: 0,
      skippedAlreadySent: 0,
    }
  }

  const dueTodayTaskCount = taskRows.filter((task) => task.due_date === reminderDate).length
  const overdueTaskCount = taskRows.filter((task) => (
    typeof task.due_date === 'string'
    && task.due_date.length > 0
    && task.due_date < reminderDate
  )).length

  const taskIds = taskRows.map((task) => task.id)
  const { data: assignees, error: assigneesError } = await admin
    .from('task_assignees')
    .select('task_id, user_id')
    .eq('business_id', businessId)
    .in('task_id', taskIds)

  if (assigneesError) {
    throw new Error('Could not load task assignees for reminders.')
  }

  const assigneeRows = (assignees ?? []) as Array<{ task_id: string; user_id: string }>
  if (assigneeRows.length === 0) {
    return {
      success: true,
      reminderDate,
      dueTaskCount: taskRows.length,
      dueTodayTaskCount,
      overdueTaskCount,
      notifiedRecipients: 0,
      sentTaskCount: 0,
      skippedAlreadySent: 0,
    }
  }

  const assigneeUserIds = toUniqueIds(assigneeRows.map((row) => row.user_id))
  const { data: validProfiles, error: validProfilesError } = await admin
    .from('profiles')
    .select('id')
    .eq('business_id', businessId)
    .in('id', assigneeUserIds)

  if (validProfilesError) {
    throw new Error('Could not validate assignees for due reminders.')
  }

  const validProfileIdSet = new Set((validProfiles ?? []).map((row: { id: string }) => row.id))
  const { data: reminderLogs, error: reminderLogsError } = await admin
    .from('task_due_reminder_log')
    .select('task_id, user_id')
    .eq('business_id', businessId)
    .eq('reminder_date', reminderDate)
    .in('task_id', taskIds)

  if (reminderLogsError) {
    throw new Error(
      'Task reminder log table is missing or inaccessible. Run supabase/tasks_mvp.sql to enable due reminder dedupe.'
    )
  }

  const alreadySentKeySet = new Set(
    (reminderLogs ?? []).map((row: { task_id: string; user_id: string }) => `${row.task_id}:${row.user_id}`)
  )
  const recipientMapByTask = new Map<string, string[]>()
  assigneeRows.forEach((row) => {
    if (!validProfileIdSet.has(row.user_id)) return
    const key = `${row.task_id}:${row.user_id}`
    if (alreadySentKeySet.has(key)) return
    const current = recipientMapByTask.get(row.task_id) ?? []
    if (!current.includes(row.user_id)) current.push(row.user_id)
    recipientMapByTask.set(row.task_id, current)
  })

  let notifiedRecipients = 0
  let sentTaskCount = 0
  let skippedAlreadySent = 0
  const reminderLogRowsToInsert: Array<{
    business_id: string
    task_id: string
    user_id: string
    reminder_date: string
  }> = []

  for (const task of taskRows) {
    const taskRecipients = recipientMapByTask.get(task.id) ?? []
    if (taskRecipients.length === 0) {
      skippedAlreadySent += 1
      continue
    }

    const safeTitle = typeof task.title === 'string' && task.title.trim()
      ? task.title.trim()
      : 'Task'
    const dueDate = typeof task.due_date === 'string' && task.due_date.trim()
      ? task.due_date.trim()
      : reminderDate
    const isOverdue = dueDate < reminderDate

    try {
      await sendPushNotification({
        recipients: taskRecipients,
        heading: isOverdue ? 'Task overdue' : 'Task due today',
        content: isOverdue ? `${truncate(safeTitle, 80)} • Due ${dueDate}` : truncate(safeTitle, 100),
        data: {
          type: 'task_due_reminder',
          businessId,
          taskId: task.id,
          dueDate,
          isOverdue,
        },
        idempotencyKey: `task-due:${task.id}:${reminderDate}:${isOverdue ? 'overdue' : 'due'}:${taskRecipients.slice().sort().join(',')}`,
        collapseId: `task-due:${task.id}:${reminderDate}:${isOverdue ? 'overdue' : 'due'}`,
      })

      try {
        await persistTaskInAppNotifications({
          admin,
          businessId,
          taskId: task.id,
          actorUserId: 'system:task-reminder',
          recipientUserIds: taskRecipients,
          payload: {
            type: 'task_due_reminder',
            authorName: 'Fyll',
            body: isOverdue
              ? `${truncate(safeTitle, 80)} is overdue (due ${dueDate})`
              : `${truncate(safeTitle, 80)} is due today`,
            entityType: 'task',
            entityId: task.id,
            taskId: task.id,
            taskTitle: safeTitle,
            dueDate,
            isOverdue,
          },
        })
      } catch (error) {
        console.warn('Task due reminder in-app notification persistence failed:', error)
      }

      sentTaskCount += 1
      notifiedRecipients += taskRecipients.length
      taskRecipients.forEach((userId) => {
        reminderLogRowsToInsert.push({
          business_id: businessId,
          task_id: task.id,
          user_id: userId,
          reminder_date: reminderDate,
        })
      })
    } catch (error) {
      console.warn('Task due reminder send failed for task:', task.id, error)
    }
  }

  if (reminderLogRowsToInsert.length > 0) {
    const { error: insertLogError } = await admin
      .from('task_due_reminder_log')
      .upsert(reminderLogRowsToInsert, {
        onConflict: 'business_id,task_id,user_id,reminder_date',
        ignoreDuplicates: true,
      })

    if (insertLogError) {
      throw new Error('Could not persist task reminder log rows.')
    }
  }

  return {
    success: true,
    reminderDate,
    dueTaskCount: taskRows.length,
    dueTodayTaskCount,
    overdueTaskCount,
    notifiedRecipients,
    sentTaskCount,
    skippedAlreadySent,
  }
}

const resolveReminderIso = (value?: string | null) => {
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }
  return new Date().toISOString()
}

const sendTaskEventReminders = async (
  admin: ReturnType<typeof getAdminClient>,
  businessId: string,
  reminderIsoInput?: string | null,
) => {
  const reminderIso = resolveReminderIso(reminderIsoInput)
  const reminderTime = new Date(reminderIso)
  const soonWindowStart = reminderTime.getTime() + (25 * 60 * 1000)
  const soonWindowEnd = reminderTime.getTime() + (30 * 60 * 1000)
  const nowWindowStart = reminderTime.getTime() - (5 * 60 * 1000)
  const nowWindowEnd = reminderTime.getTime() + (5 * 60 * 1000)

  const { data: eventTasks, error: eventTasksError } = await admin
    .from('tasks')
    .select('id, title, starts_at, status')
    .eq('business_id', businessId)
    .eq('item_type', 'event')
    .in('status', ['todo', 'in_progress'])
    .not('starts_at', 'is', null)

  if (eventTasksError) {
    throw new Error('Could not load event tasks for reminders.')
  }

  const reminderCandidates = ((eventTasks ?? []) as Array<{
    id: string
    title?: string | null
    starts_at?: string | null
    status?: string | null
  }>).flatMap((task) => {
    const startsAt = typeof task.starts_at === 'string' ? task.starts_at.trim() : ''
    if (!startsAt) return []
    const startMs = new Date(startsAt).getTime()
    if (!Number.isFinite(startMs)) return []

    const rows: Array<{
      taskId: string
      title: string
      startsAt: string
      stage: 'soon' | 'now'
      reminderKey: string
    }> = []

    if (startMs >= soonWindowStart && startMs <= soonWindowEnd) {
      rows.push({
        taskId: task.id,
        title: typeof task.title === 'string' && task.title.trim() ? task.title.trim() : 'Event',
        startsAt,
        stage: 'soon',
        reminderKey: `event_30m:${task.id}:${startsAt}`,
      })
    }

    if (startMs >= nowWindowStart && startMs <= nowWindowEnd) {
      rows.push({
        taskId: task.id,
        title: typeof task.title === 'string' && task.title.trim() ? task.title.trim() : 'Event',
        startsAt,
        stage: 'now',
        reminderKey: `event_now:${task.id}:${startsAt}`,
      })
    }

    return rows
  })

  if (reminderCandidates.length === 0) {
    return {
      success: true,
      reminderIso,
      eventCount: 0,
      notifiedRecipients: 0,
      sentReminderCount: 0,
      skippedAlreadySent: 0,
    }
  }

  const taskIds = Array.from(new Set(reminderCandidates.map((candidate) => candidate.taskId)))
  const { data: assignees, error: assigneesError } = await admin
    .from('task_assignees')
    .select('task_id, user_id')
    .eq('business_id', businessId)
    .in('task_id', taskIds)

  if (assigneesError) {
    throw new Error('Could not load event assignees for reminders.')
  }

  const assigneeRows = (assignees ?? []) as Array<{ task_id: string; user_id: string }>
  if (assigneeRows.length === 0) {
    return {
      success: true,
      reminderIso,
      eventCount: reminderCandidates.length,
      notifiedRecipients: 0,
      sentReminderCount: 0,
      skippedAlreadySent: 0,
    }
  }

  const assigneeUserIds = toUniqueIds(assigneeRows.map((row) => row.user_id))
  const { data: validProfiles, error: validProfilesError } = await admin
    .from('profiles')
    .select('id')
    .eq('business_id', businessId)
    .in('id', assigneeUserIds)

  if (validProfilesError) {
    throw new Error('Could not validate event assignees for reminders.')
  }

  const validProfileIdSet = new Set((validProfiles ?? []).map((row: { id: string }) => row.id))
  const reminderKeys = reminderCandidates.map((candidate) => candidate.reminderKey)
  const { data: reminderLogs, error: reminderLogsError } = await admin
    .from('task_event_reminder_log')
    .select('task_id, user_id, reminder_key')
    .eq('business_id', businessId)
    .in('task_id', taskIds)
    .in('reminder_key', reminderKeys)

  if (reminderLogsError) {
    throw new Error(
      'Task event reminder log table is missing or inaccessible. Run supabase/task_event_reminders_mvp.sql to enable event reminder dedupe.'
    )
  }

  const alreadySentKeySet = new Set(
    (reminderLogs ?? []).map((row: { task_id: string; user_id: string; reminder_key: string }) => `${row.task_id}:${row.user_id}:${row.reminder_key}`)
  )
  const recipientMapByTask = new Map<string, string[]>()
  assigneeRows.forEach((row) => {
    if (!validProfileIdSet.has(row.user_id)) return
    const current = recipientMapByTask.get(row.task_id) ?? []
    if (!current.includes(row.user_id)) current.push(row.user_id)
    recipientMapByTask.set(row.task_id, current)
  })

  let notifiedRecipients = 0
  let sentReminderCount = 0
  let skippedAlreadySent = 0
  const reminderLogRowsToInsert: Array<{
    business_id: string
    task_id: string
    user_id: string
    reminder_key: string
  }> = []

  for (const candidate of reminderCandidates) {
    const taskRecipients = (recipientMapByTask.get(candidate.taskId) ?? []).filter((userId) => (
      !alreadySentKeySet.has(`${candidate.taskId}:${userId}:${candidate.reminderKey}`)
    ))
    if (taskRecipients.length === 0) {
      skippedAlreadySent += 1
      continue
    }

    const heading = candidate.stage === 'now' ? 'Event starting now' : 'Event in 30 min'
    const body = candidate.stage === 'now'
      ? `${truncate(candidate.title, 80)} is starting now`
      : `${truncate(candidate.title, 80)} starts in 30 minutes`

    try {
      await sendPushNotification({
        recipients: taskRecipients,
        heading,
        content: body,
        data: {
          type: 'task_event_reminder',
          businessId,
          taskId: candidate.taskId,
          startsAt: candidate.startsAt,
          reminderStage: candidate.stage,
        },
        idempotencyKey: `${candidate.reminderKey}:${taskRecipients.slice().sort().join(',')}`,
        collapseId: candidate.reminderKey,
      })

      try {
        await persistTaskInAppNotifications({
          admin,
          businessId,
          taskId: candidate.taskId,
          actorUserId: 'system:event-reminder',
          recipientUserIds: taskRecipients,
          payload: {
            type: 'task_event_reminder',
            authorName: 'Fyll',
            body,
            entityType: 'task',
            entityId: candidate.taskId,
            taskId: candidate.taskId,
            startsAt: candidate.startsAt,
            reminderStage: candidate.stage,
          },
        })
      } catch (error) {
        console.warn('Task event reminder in-app notification persistence failed:', error)
      }

      sentReminderCount += 1
      notifiedRecipients += taskRecipients.length
      taskRecipients.forEach((userId) => {
        reminderLogRowsToInsert.push({
          business_id: businessId,
          task_id: candidate.taskId,
          user_id: userId,
          reminder_key: candidate.reminderKey,
        })
      })
    } catch (error) {
      console.warn('Task event reminder send failed for task:', candidate.taskId, error)
    }
  }

  if (reminderLogRowsToInsert.length > 0) {
    const { error: insertLogError } = await admin
      .from('task_event_reminder_log')
      .upsert(reminderLogRowsToInsert, {
        onConflict: 'business_id,task_id,user_id,reminder_key',
        ignoreDuplicates: true,
      })

    if (insertLogError) {
      throw new Error('Could not persist task event reminder log rows.')
    }
  }

  return {
    success: true,
    reminderIso,
    eventCount: reminderCandidates.length,
    notifiedRecipients,
    sentReminderCount,
    skippedAlreadySent,
  }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(500, { error: 'Notification service is not configured.' })
  }

  try {
    const admin = getAdminClient()

    // Cron auth: bypass user JWT when a valid CRON_SECRET is provided.
    const rawAuth = req.headers.get('Authorization') ?? ''
    const rawToken = rawAuth.startsWith('Bearer ') ? rawAuth.slice(7).trim() : ''
    if (CRON_SECRET.length >= 16 && rawToken === CRON_SECRET) {
      const payload = await req.json()

      if (payload?.type === 'storefront_order_created') {
        const storefrontPayload = payload as StorefrontOrderCreatedPayload
        const businessId = typeof storefrontPayload.businessId === 'string' ? storefrontPayload.businessId.trim() : ''
        const orderNumber = typeof storefrontPayload.orderNumber === 'string' ? storefrontPayload.orderNumber.trim() : ''
        if (!businessId || !orderNumber) {
          return jsonResponse(400, { error: 'Missing businessId or orderNumber.' })
        }
        const result = await notifyStorefrontOrder(
          admin,
          businessId,
          orderNumber,
          typeof storefrontPayload.customerName === 'string' ? storefrontPayload.customerName.trim() : '',
          typeof storefrontPayload.totalAmount === 'string' ? storefrontPayload.totalAmount.trim() : '0',
          typeof storefrontPayload.trackingCode === 'string' ? storefrontPayload.trackingCode.trim() : undefined,
        )
        return jsonResponse(200, { success: true, type: 'storefront_order_created', result })
      }

      if (payload?.type === 'payment_received') {
        const result = await notifyPaymentReceived(admin, payload as PaymentReceivedPayload)
        return jsonResponse(200, { success: true, type: 'payment_received', result })
      }

      if (payload?.type === 'order_delivery_details_updated') {
        const detailsPayload = payload as OrderDeliveryDetailsUpdatedPayload
        const businessId = typeof detailsPayload.businessId === 'string' ? detailsPayload.businessId.trim() : ''
        const orderNumber = typeof detailsPayload.orderNumber === 'string' ? detailsPayload.orderNumber.trim() : ''
        if (!businessId || !orderNumber) {
          return jsonResponse(400, { error: 'Missing businessId or orderNumber.' })
        }
        const result = await notifyOrderDeliveryDetailsUpdated(
          admin,
          businessId,
          orderNumber,
          typeof detailsPayload.customerName === 'string' ? detailsPayload.customerName.trim() : '',
        )
        return jsonResponse(200, { success: true, type: 'order_delivery_details_updated', result })
      }

      if (payload?.type !== 'task_due_reminders_all') {
        return jsonResponse(400, { error: 'Invalid cron payload type.' })
      }
      const { data: businesses } = await admin
        .from('tasks')
        .select('business_id')
        .in('status', ['todo', 'in_progress'])
      const uniqueBusinessIds = Array.from(new Set<string>(
        (businesses ?? [])
          .map((b: { business_id: string }) => b.business_id)
          .filter((businessId: string): businessId is string => typeof businessId === 'string' && businessId.trim().length > 0)
      ))
      const results = await Promise.allSettled(
        uniqueBusinessIds.map((bid: string) => sendTaskDueReminders(admin, bid, null))
      )
      return jsonResponse(200, {
        success: true,
        type: 'task_due_reminders_all',
        businesses: uniqueBusinessIds.length,
        sent: results.filter(r => r.status === 'fulfilled').length,
        failed: results.filter(r => r.status === 'rejected').length,
      })
    }

    const payload = await req.json() as
      | ThreadMessagePayload
      | OrderCreatedPayload
      | TaskAssignedPayload
      | TaskCompletedPayload
      | TaskDueRemindersPayload
      | TaskEventRemindersPayload
      | DirectSubscriptionTestPayload
      | ExpoPushTestPayload
      | PartnerJobDispatchedPayload
      | PartnerIssueReportedPayload
      | PartnerIssueResolvedPayload
      | PartnerJobEventPayload
      | PartnerTestPushPayload
    const mode = payload.type ?? 'thread_message'

    // Self-test push for a signed-in partner — no businessId needed, just
    // their own bearer token.
    if (mode === 'partner_test_push') {
      const testToken = getBearerToken(req)
      if (!testToken) {
        return jsonResponse(401, { error: 'Missing bearer token.' })
      }
      const { data: testAuthData } = await admin.auth.getUser(testToken)
      const testUserId = testAuthData?.user?.id
      if (!testUserId) {
        return jsonResponse(401, { error: 'Invalid auth token.' })
      }
      const result = await sendPushNotification({
        recipients: [testUserId],
        heading: 'Test notification',
        content: 'If you can see this, push notifications are working.',
        data: { type: 'partner_test_push' },
        channel: 'partner',
      })
      return jsonResponse(200, { success: true, type: mode, result })
    }

    const businessId = typeof payload.businessId === 'string' ? payload.businessId.trim() : ''

    if (!businessId) {
      return jsonResponse(400, { error: 'Missing businessId.' })
    }

    // partner_job_event is triggered from the partner portal, which has no
    // business-staff session — authenticate via the partner's own magic-link
    // token or their own auth session instead of requiring a business bearer
    // token (mirrors how the partner-portal RPCs authenticate).
    if (mode === 'partner_job_event') {
      const eventPayload = payload as PartnerJobEventPayload
      const jobId = typeof eventPayload.jobId === 'string' ? eventPayload.jobId.trim() : ''
      const event = eventPayload.event
      if (!jobId || !event) {
        return jsonResponse(400, { error: 'Missing jobId or event.' })
      }

      const partnerCallerToken = getBearerToken(req)
      const matchedPartner = await resolvePartnerCaller(
        admin,
        businessId,
        eventPayload.partnerToken,
        partnerCallerToken,
      )
      if (!matchedPartner) {
        return jsonResponse(401, { error: 'Could not verify partner.' })
      }

      const partnerData = matchedPartner.data
      const partnerName = typeof partnerData?.name === 'string' && partnerData.name.trim()
        ? partnerData.name.trim()
        : 'A partner'
      const customerName = typeof eventPayload.customerName === 'string' ? eventPayload.customerName.trim() : 'a customer'
      const itemLabel = typeof eventPayload.itemLabel === 'string' ? eventPayload.itemLabel.trim() : 'a job'

      const result = await notifyBusinessOfPartnerEvent({
        admin,
        businessId,
        partnerId: matchedPartner.id,
        partnerName,
        jobId,
        event,
        customerName,
        itemLabel,
        amount: typeof eventPayload.amount === 'string' ? eventPayload.amount : undefined,
        statusLabel: typeof eventPayload.statusLabel === 'string' ? eventPayload.statusLabel : undefined,
      })

      return jsonResponse(200, { success: true, type: mode, result })
    }

    const token = getBearerToken(req)
    if (!token) {
      return jsonResponse(401, { error: 'Missing bearer token.' })
    }

    const {
      data: authData,
      error: authError,
    } = await admin.auth.getUser(token)

    const user = authData.user
    if (authError || !user?.id) {
      return jsonResponse(401, { error: 'Invalid auth token.' })
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('id, business_id, name, email')
      .eq('id', user.id)
      .maybeSingle()

    // Also check team_members for business_id (team members may not have profiles)
    const { data: teamMemberRow } = await admin
      .from('team_members')
      .select('business_id, name, email')
      .eq('user_id', user.id)
      .maybeSingle()

    const resolvedBusinessId = (
      (profile?.business_id as string | null)?.trim() ||
      (teamMemberRow?.business_id as string | null)?.trim() ||
      businessId
    )

    if (!resolvedBusinessId) {
      return jsonResponse(403, { error: 'Business access denied.' })
    }

    // Build a unified profile-like object for name/email lookups
    const effectiveProfile = profile ?? {
      id: user.id,
      business_id: resolvedBusinessId,
      name: (teamMemberRow?.name as string | null) ?? null,
      email: (teamMemberRow?.email as string | null) ?? null,
    }
    const profileForName = effectiveProfile as { id: string; business_id: string | null; name: string | null; email: string | null }

    if (mode === 'order_created') {
      const orderPayload = payload as OrderCreatedPayload
      const orderNumber = typeof orderPayload.orderNumber === 'string' ? orderPayload.orderNumber.trim() : ''
      const customerName = typeof orderPayload.customerName === 'string' ? orderPayload.customerName.trim() : 'Walk-in'
      const totalAmount = typeof orderPayload.totalAmount === 'string' ? orderPayload.totalAmount.trim() : '0'
      const createdBy = typeof orderPayload.createdBy === 'string' ? orderPayload.createdBy.trim() : profileForName.name ?? undefined

      if (!orderNumber) {
        return jsonResponse(400, { error: 'Missing orderNumber.' })
      }

      const result = await sendBusinessWideOrderNotification(
        admin,
        resolvedBusinessId,
        orderNumber,
        customerName,
        totalAmount,
        createdBy,
        user.id,
      )

      return jsonResponse(200, { success: true, type: mode, result })
    }

    if (mode === 'task_due_reminders') {
      const dueReminderPayload = payload as TaskDueRemindersPayload
      const result = await sendTaskDueReminders(admin, resolvedBusinessId, dueReminderPayload.reminderDate ?? null)
      return jsonResponse(200, { success: true, type: mode, result })
    }

    if (mode === 'task_event_reminders') {
      const eventReminderPayload = payload as TaskEventRemindersPayload
      const result = await sendTaskEventReminders(admin, resolvedBusinessId, eventReminderPayload.reminderIso ?? null)
      return jsonResponse(200, { success: true, type: mode, result })
    }

    if (mode === 'partner_job_dispatched') {
      const dispatchPayload = payload as PartnerJobDispatchedPayload
      const partnerId = typeof dispatchPayload.partnerId === 'string' ? dispatchPayload.partnerId.trim() : ''
      const jobId = typeof dispatchPayload.jobId === 'string' ? dispatchPayload.jobId.trim() : ''
      if (!partnerId || !jobId) {
        return jsonResponse(400, { error: 'Missing partnerId or jobId.' })
      }

      const { data: businessRow } = await admin
        .from('businesses')
        .select('name,data')
        .eq('id', resolvedBusinessId)
        .maybeSingle()
      const businessData = (businessRow?.data ?? {}) as Record<string, unknown>
      const businessName = (typeof businessData.businessName === 'string' && businessData.businessName.trim())
        || (businessRow?.name as string | undefined)?.trim()
        || 'Fyll'

      const result = await sendPartnerJobDispatchedNotification({
        admin,
        businessId: resolvedBusinessId,
        partnerId,
        jobId,
        businessName,
        customerName: typeof dispatchPayload.customerName === 'string' ? dispatchPayload.customerName.trim() || 'a customer' : 'a customer',
        itemLabel: typeof dispatchPayload.itemLabel === 'string' ? dispatchPayload.itemLabel.trim() || 'a job' : 'a job',
      })

      return jsonResponse(200, { success: true, type: mode, result })
    }

    if (mode === 'partner_issue_reported') {
      const issuePayload = payload as PartnerIssueReportedPayload
      const partnerId = typeof issuePayload.partnerId === 'string' ? issuePayload.partnerId.trim() : ''
      const jobId = typeof issuePayload.jobId === 'string' ? issuePayload.jobId.trim() : ''
      const issueId = typeof issuePayload.issueId === 'string' ? issuePayload.issueId.trim() : ''
      if (!partnerId || !jobId || !issueId) {
        return jsonResponse(400, { error: 'Missing partnerId, jobId, or issueId.' })
      }

      const { data: businessRow } = await admin
        .from('businesses')
        .select('name,data')
        .eq('id', resolvedBusinessId)
        .maybeSingle()
      const businessData = (businessRow?.data ?? {}) as Record<string, unknown>
      const businessName = (typeof businessData.businessName === 'string' && businessData.businessName.trim())
        || (businessRow?.name as string | undefined)?.trim()
        || 'Fyll'

      const result = await sendPartnerIssueReportedNotification({
        admin,
        businessId: resolvedBusinessId,
        partnerId,
        jobId,
        issueId,
        businessName,
        customerName: typeof issuePayload.customerName === 'string' ? issuePayload.customerName.trim() || 'a customer' : 'a customer',
        itemLabel: typeof issuePayload.itemLabel === 'string' ? issuePayload.itemLabel.trim() || 'a job' : 'a job',
      })

      return jsonResponse(200, { success: true, type: mode, result })
    }

    if (mode === 'partner_issue_resolved') {
      const issuePayload = payload as PartnerIssueResolvedPayload
      const partnerId = typeof issuePayload.partnerId === 'string' ? issuePayload.partnerId.trim() : ''
      const jobId = typeof issuePayload.jobId === 'string' ? issuePayload.jobId.trim() : ''
      const issueId = typeof issuePayload.issueId === 'string' ? issuePayload.issueId.trim() : ''
      if (!partnerId || !jobId || !issueId) {
        return jsonResponse(400, { error: 'Missing partnerId, jobId, or issueId.' })
      }

      const { data: businessRow } = await admin
        .from('businesses')
        .select('name,data')
        .eq('id', resolvedBusinessId)
        .maybeSingle()
      const businessData = (businessRow?.data ?? {}) as Record<string, unknown>
      const businessName = (typeof businessData.businessName === 'string' && businessData.businessName.trim())
        || (businessRow?.name as string | undefined)?.trim()
        || 'Fyll'

      const result = await sendPartnerIssueResolvedNotification({
        admin,
        businessId: resolvedBusinessId,
        partnerId,
        jobId,
        issueId,
        businessName,
        customerName: typeof issuePayload.customerName === 'string' ? issuePayload.customerName.trim() || 'a customer' : 'a customer',
        itemLabel: typeof issuePayload.itemLabel === 'string' ? issuePayload.itemLabel.trim() || 'a job' : 'a job',
      })

      return jsonResponse(200, { success: true, type: mode, result })
    }

    if (mode === 'task_assigned') {
      const taskPayload = payload as TaskAssignedPayload
      const taskId = typeof taskPayload.taskId === 'string' ? taskPayload.taskId.trim() : ''
      const taskTitle = typeof taskPayload.taskTitle === 'string' ? taskPayload.taskTitle.trim() : ''
      const recipients = toUniqueIds(taskPayload.recipientUserIds)
      if (!taskId || !taskTitle) {
        return jsonResponse(400, { error: 'Missing taskId or taskTitle.' })
      }
      if (recipients.length > 200) {
        return jsonResponse(400, { error: 'Too many recipients in one request.' })
      }
      if (recipients.length === 0) {
        return jsonResponse(200, { success: true, type: mode, message: 'No recipients.' })
      }

      // Use listBusinessRecipientIds (checks both profiles + team_members) so staff
      // members who don't have a matching profile row are still found.
      const allBusinessMemberIds = await listBusinessRecipientIds(admin, resolvedBusinessId)
      const validMemberIdSet = new Set(allBusinessMemberIds.map(normalizeId))

      const senderUserIdFromPayload = typeof taskPayload.senderUserId === 'string'
        ? taskPayload.senderUserId
        : null

      const validRecipientIds = toUniqueIds(
        recipients.filter((id) => {
          const nid = normalizeId(id)
          if (!validMemberIdSet.has(nid)) return false
          if (nid === normalizeId(user.id)) return false
          if (senderUserIdFromPayload && nid === normalizeId(senderUserIdFromPayload)) return false
          return true
        })
      )

      if (validRecipientIds.length === 0) {
        return jsonResponse(200, { success: true, type: mode, message: 'No valid recipients.' })
      }

      await sendTaskAssignmentNotification({
        businessId,
        recipients: validRecipientIds,
        taskId,
        taskTitle,
        dueDate: typeof taskPayload.dueDate === 'string' ? taskPayload.dueDate : null,
        assignerName: typeof taskPayload.assignerName === 'string'
          ? taskPayload.assignerName
          : (profileForName.name ?? null),
        isReassignment: Boolean(taskPayload.isReassignment),
      })

      try {
        const assignerName = typeof taskPayload.assignerName === 'string'
          ? taskPayload.assignerName
          : (profileForName.name ?? 'A team member')
        const dueDate = typeof taskPayload.dueDate === 'string' ? taskPayload.dueDate : null
        const readableBody = `${assignerName} assigned you: ${truncate(taskTitle, 80)}${dueDate ? ` (due ${dueDate})` : ''}`
        await persistTaskInAppNotifications({
          admin,
          businessId,
          taskId,
          actorUserId: user.id,
          recipientUserIds: validRecipientIds,
          payload: {
            type: 'task_assigned',
            authorName: assignerName,
            body: readableBody,
            entityType: 'task',
            entityId: taskId,
            taskId,
            taskTitle,
            dueDate,
            isReassignment: Boolean(taskPayload.isReassignment),
          },
        })
      } catch (error) {
        console.warn('Task assigned in-app notification persistence failed:', error)
      }

      return jsonResponse(200, {
        success: true,
        type: mode,
        notified: validRecipientIds.length,
      })
    }

    if (mode === 'task_completed') {
      const taskPayload = payload as TaskCompletedPayload
      const taskId = typeof taskPayload.taskId === 'string' ? taskPayload.taskId.trim() : ''
      const taskTitle = typeof taskPayload.taskTitle === 'string' ? taskPayload.taskTitle.trim() : ''
      const recipients = toUniqueIds(taskPayload.recipientUserIds)
      if (!taskId || !taskTitle) {
        return jsonResponse(400, { error: 'Missing taskId or taskTitle.' })
      }
      if (recipients.length > 200) {
        return jsonResponse(400, { error: 'Too many recipients in one request.' })
      }
      if (recipients.length === 0) {
        return jsonResponse(200, { success: true, type: mode, message: 'No recipients.' })
      }

      // Use listBusinessRecipientIds (checks both profiles + team_members) so staff
      // members who don't have a matching profile row are still found.
      const allBusinessMemberIds = await listBusinessRecipientIds(admin, resolvedBusinessId)
      const validMemberIdSet = new Set(allBusinessMemberIds.map(normalizeId))

      const senderUserIdFromPayload = typeof taskPayload.senderUserId === 'string'
        ? taskPayload.senderUserId
        : null

      const validRecipientIds = toUniqueIds(
        recipients.filter((id) => {
          const nid = normalizeId(id)
          if (!validMemberIdSet.has(nid)) return false
          if (nid === normalizeId(user.id)) return false
          if (senderUserIdFromPayload && nid === normalizeId(senderUserIdFromPayload)) return false
          return true
        })
      )

      if (validRecipientIds.length === 0) {
        return jsonResponse(200, { success: true, type: mode, message: 'No valid recipients.' })
      }

      await sendTaskCompletedNotification({
        businessId,
        recipients: validRecipientIds,
        taskId,
        taskTitle,
        completedByName: typeof taskPayload.completedByName === 'string'
          ? taskPayload.completedByName
          : (profileForName.name ?? null),
        completedAt: typeof taskPayload.completedAt === 'string' ? taskPayload.completedAt : null,
      })

      try {
        const completedByName = typeof taskPayload.completedByName === 'string'
          ? taskPayload.completedByName
          : (profileForName.name ?? 'A team member')
        const completedAt = typeof taskPayload.completedAt === 'string' ? taskPayload.completedAt : null
        const readableBody = `${completedByName} completed: ${truncate(taskTitle, 80)}${completedAt ? ` (${completedAt.slice(0, 10)})` : ''}`
        await persistTaskInAppNotifications({
          admin,
          businessId,
          taskId,
          actorUserId: user.id,
          recipientUserIds: validRecipientIds,
          payload: {
            type: 'task_completed',
            authorName: completedByName,
            body: readableBody,
            entityType: 'task',
            entityId: taskId,
            taskId,
            taskTitle,
            completedAt,
          },
        })
      } catch (error) {
        console.warn('Task completed in-app notification persistence failed:', error)
      }

      return jsonResponse(200, {
        success: true,
        type: mode,
        notified: validRecipientIds.length,
      })
    }

    if (mode === 'direct_subscription_test') {
      const directPayload = payload as DirectSubscriptionTestPayload
      const subscriptionId = typeof directPayload.subscriptionId === 'string'
        ? directPayload.subscriptionId.trim()
        : ''

      if (!subscriptionId) {
        return jsonResponse(400, { error: 'Missing subscriptionId.' })
      }

      const delivery = await sendOneSignalDirectSubscriptionNotification({
        subscriptionId,
        heading: typeof directPayload.heading === 'string' && directPayload.heading.trim()
          ? directPayload.heading.trim()
          : 'Fyll iPhone Test',
        content: typeof directPayload.content === 'string' && directPayload.content.trim()
          ? directPayload.content.trim()
          : 'This is a direct push test to this device.',
        data: {
          type: 'direct_subscription_test',
          resolvedBusinessId,
          actorUserId: user.id,
          subscriptionId,
        },
      })

      return jsonResponse(200, {
        success: true,
        type: mode,
        delivery,
      })
    }

    if (mode === 'expo_push_test') {
      const delivery = await sendExpoPushNotifications(
        [user.id],
        '🔔 Fyll test notification',
        'If you see this, push notifications are working on this phone.',
        { type: 'expo_push_test', resolvedBusinessId, actorUserId: user.id },
      )

      return jsonResponse(200, {
        success: true,
        type: mode,
        delivery,
      })
    }

    const threadPayload = payload as ThreadMessagePayload

    const senderUserIdFromPayload = typeof threadPayload.senderUserId === 'string'
      ? threadPayload.senderUserId
      : null

    // Use recipientUserIds from payload when provided; fall back to all business members
    const payloadRecipientIds = toUniqueIds(threadPayload.recipientUserIds)
    let pushRecipientIds: string[]
    let businessRecipientIds: string[] = []
    if (payloadRecipientIds.length > 0) {
      pushRecipientIds = payloadRecipientIds
    } else {
      businessRecipientIds = await listBusinessRecipientIds(admin, resolvedBusinessId)
      pushRecipientIds = toUniqueIds(businessRecipientIds)
    }
    console.log('Thread notification recipient resolution', {
      resolvedBusinessId,
      senderUserId: user.id,
      senderUserIdFromPayload,
      payloadRecipientCount: payloadRecipientIds.length,
      businessRecipientCount: businessRecipientIds.length,
      pushRecipientCount: pushRecipientIds.length,
      threadId: threadPayload.threadId ?? null,
      commentId: threadPayload.commentId ?? null,
    })
    if (pushRecipientIds.length === 0) {
      console.warn('Thread notification: no business recipients available.')
      return jsonResponse(200, { success: true, type: mode, message: 'No valid recipients.' })
    }

    let entityType: 'order' | 'case' | 'task' | null = threadPayload.entityType ?? null
    let entityId: string | null = threadPayload.entityId ?? null

    if (threadPayload.threadId) {
      const { data: threadRow } = await admin
        .from('collaboration_threads')
        .select('entity_type, entity_id')
        .eq('id', threadPayload.threadId)
        .eq('business_id', resolvedBusinessId)
        .maybeSingle()

      // Non-blocking — use payload values if thread row not found
      if (!threadRow) {
        console.warn('Thread row not found for threadId:', threadPayload.threadId)
      }

      entityType = (threadRow?.entity_type as ('order' | 'case' | 'task' | null | undefined)) ?? entityType
      entityId = threadRow?.entity_id ?? entityId
    }

    const senderName = profileForName.name?.trim() || threadPayload.authorName?.trim() || 'A team member'
    const trimmedBody = typeof threadPayload.body === 'string' && threadPayload.body.trim()
      ? threadPayload.body.trim()
      : 'New activity'

    const payloadDisplayName = threadPayload.entityDisplayName?.trim() ?? ''
    const derivedDisplayName = await getEntityDisplayName(admin, resolvedBusinessId, entityType, entityId)
    let displayName = payloadDisplayName || derivedDisplayName
    if (entityType === 'case' && isTeamThreadEntityId(entityId)) {
      const normalizedPayloadDisplayName = payloadDisplayName.toLowerCase()
      const hasGenericCaseLabel = normalizedPayloadDisplayName === ''
        || normalizedPayloadDisplayName === 'a case'
        || normalizedPayloadDisplayName === 'case'
      if (hasGenericCaseLabel) {
        displayName = getTeamThreadDisplayNameFromEntityId(entityId)
      }
    }
    const isMention = Boolean(threadPayload.isMention)
    const isEveryoneMention = isMention && Boolean(threadPayload.isEveryoneMention)

    const normalizedDisplayName = displayName.trim()
    const threadContext = entityType === 'order' && normalizedDisplayName
      ? normalizedDisplayName.toLowerCase().startsWith('order #')
        ? `thread #${normalizedDisplayName.slice(7).trim()}`
        : `thread ${normalizedDisplayName}`
      : normalizedDisplayName
        ? normalizedDisplayName
        : ''
    const heading = `New message${threadContext ? ` in ${threadContext}` : ''}`
    const messageContent = isEveryoneMention
        ? `${senderName} pinged everyone: ${truncate(trimmedBody, 100)}`
        : `${senderName}: ${truncate(trimmedBody, 100)}`
    const dedupeKeyBase = threadPayload.commentId
      ? `${threadPayload.commentId}:${isEveryoneMention ? 'everyone' : (isMention ? 'mention' : 'reply')}`
      : `${threadPayload.threadId ?? 'thread'}:${isEveryoneMention ? 'everyone' : (isMention ? 'mention' : 'reply')}:${trimmedBody.slice(0, 32)}`

    const pushResult = await sendPushNotification({
      recipients: pushRecipientIds,
      heading,
      content: messageContent,
      data: {
        type: isEveryoneMention ? 'team_ping' : (isMention ? 'mention' : 'new_message'),
        resolvedBusinessId,
        threadId: threadPayload.threadId ?? null,
        commentId: threadPayload.commentId ?? null,
        entityType,
        entityId,
        isEveryoneMention,
      },
      idempotencyKey: `${dedupeKeyBase}:${pushRecipientIds.slice().sort().join(',')}`,
      collapseId: dedupeKeyBase,
    })
    console.log('Thread notification delivery result', {
      resolvedBusinessId,
      threadId: threadPayload.threadId ?? null,
      commentId: threadPayload.commentId ?? null,
      recipientCount: pushRecipientIds.length,
      pushResult,
    })

    // Persist in-app notifications for the dropdown.
    // Note: we omit thread_id/comment_id FK columns to avoid constraint failures
    // (e.g. task threads use entity_type='task' which the threads table may not allow).
    // threadId/commentId are stored in the payload instead so the UI can navigate.
    if (threadPayload.threadId) {
      try {
        const eventType = isMention ? 'mention' : 'reply'
        const inAppRecipientIds = pushRecipientIds
          .filter((id: string) => normalizeId(id) !== normalizeId(user.id))
          .filter((id: string) => !senderUserIdFromPayload || normalizeId(id) !== normalizeId(senderUserIdFromPayload))

        const rows = inAppRecipientIds.map((recipientUserId) => ({
          business_id: resolvedBusinessId,
          user_id: recipientUserId,
          actor_user_id: user.id,
          event_type: eventType,
          payload: {
            type: eventType,
            authorName: senderName,
            body: trimmedBody,
            entityType,
            entityId,
            threadId: threadPayload.threadId,
            commentId: threadPayload.commentId ?? null,
            isMention,
            isEveryoneMention,
          },
        }))
        const { error: insertError } = await admin.from('collaboration_notifications').insert(rows)
        if (insertError) {
          console.warn('Thread in-app notification insert error:', insertError.message)
        }
      } catch (inAppError) {
        console.warn('Thread in-app notification persistence failed:', inAppError)
      }
    }

    return jsonResponse(200, {
      success: true,
      type: mode,
      notified: pushRecipientIds.length,
      delivery: pushResult,
    })
  } catch (error) {
    console.error('Notification error:', error)
    return jsonResponse(400, {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})
