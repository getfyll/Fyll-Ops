import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sanitizeEnvValue = (value: string | undefined | null) => (
  (value ?? '')
    .normalize('NFKC')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
)

const SUPABASE_URL = sanitizeEnvValue(Deno.env.get('SUPABASE_URL'))
const SUPABASE_SERVICE_ROLE_KEY = sanitizeEnvValue(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
const RESEND_API_KEY = sanitizeEnvValue(Deno.env.get('RESEND_API_KEY'))
const RESEND_FROM_EMAIL = sanitizeEnvValue(Deno.env.get('RESEND_FROM_EMAIL'))
const ONESIGNAL_APP_ID = sanitizeEnvValue(Deno.env.get('ONESIGNAL_APP_ID'))
const ONESIGNAL_REST_API_KEY = sanitizeEnvValue(Deno.env.get('ONESIGNAL_REST_API_KEY'))
const APP_BASE_URL = sanitizeEnvValue(Deno.env.get('APP_BASE_URL'))
const ALLOWED_ORIGIN = sanitizeEnvValue(Deno.env.get('ALLOWED_ORIGIN')) || '*'
const FYLL_WORDMARK_URL = APP_BASE_URL
  ? new URL('/fyll-wordmark-email.png', APP_BASE_URL).toString()
  : ''
const BUSINESS_ASSETS_PUBLIC_BASE = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/business-assets/`
  : ''

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ReturnEmailPayload = {
  type?: 'return_received'
  businessId?: string
  returnId?: string
}

type DataRow = {
  id: string
  business_id: string | null
  name?: string | null
  data: Record<string, unknown> | null
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

const toTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const getFirstName = (value: string) => toTrimmedString(value).split(/\s+/).filter(Boolean)[0] || 'there'
const normalizeBusinessName = (value: string) => value.trim() || 'Fyll'
const buildSenderName = (businessName: string) => `${normalizeBusinessName(businessName)} - Fyll`
const compactBusinessId = (value: string | null | undefined) => (
  (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^biz-/, '')
    .replace(/-/g, '')
)
const getBusinessIdAliases = (value: string | null | undefined) => {
  const compact = compactBusinessId(value)
  if (!compact) return []
  return Array.from(new Set([value?.trim() ?? '', `biz-${compact}`].filter(Boolean)))
}

const escapeHtml = (value: string) => (
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
)

const normalizeEmailImageUrl = (value: unknown) => {
  const trimmed = toTrimmedString(value)
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) {
    if (SUPABASE_URL) {
      try {
        const parsed = new URL(trimmed)
        const supabaseOrigin = new URL(SUPABASE_URL).origin
        if (parsed.origin === supabaseOrigin) {
          const signedPrefix = '/storage/v1/object/sign/business-assets/'
          const authenticatedPrefix = '/storage/v1/object/authenticated/business-assets/'
          const publicPrefix = '/storage/v1/object/public/business-assets/'

          if (parsed.pathname.startsWith(signedPrefix)) {
            return new URL(parsed.pathname.slice(signedPrefix.length), BUSINESS_ASSETS_PUBLIC_BASE).toString()
          }

          if (parsed.pathname.startsWith(authenticatedPrefix)) {
            return new URL(parsed.pathname.slice(authenticatedPrefix.length), BUSINESS_ASSETS_PUBLIC_BASE).toString()
          }

          if (parsed.pathname.startsWith(publicPrefix)) {
            return new URL(parsed.pathname.slice(publicPrefix.length), BUSINESS_ASSETS_PUBLIC_BASE).toString()
          }
        }
      } catch {
        return trimmed
      }
    }

    return trimmed
  }
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`
  if (BUSINESS_ASSETS_PUBLIC_BASE && !trimmed.startsWith('data:image/')) {
    return new URL(trimmed.replace(/^\/+/, ''), BUSINESS_ASSETS_PUBLIC_BASE).toString()
  }
  return ''
}

const renderNote = (value: string) => escapeHtml(value).replace(/\n/g, '<br />')

const reasonLabel = (value: string, otherReason: string) => {
  if (value === 'wrong_item') return 'Wrong item received'
  if (value === 'damaged') return 'Item arrived damaged'
  if (value === 'changed_mind') return 'Changed mind'
  if (value === 'other') return otherReason || 'Other reason'
  return value || 'Return request'
}

const resolutionLabel = (value: string) => {
  if (value === 'refund') return 'Refund'
  if (value === 'exchange') return 'Exchange'
  return value || 'Not specified'
}

const shippingPayerLabel = (value: string) => {
  if (value === 'seller') return 'Business covers return shipping'
  if (value === 'customer') return 'Customer covers return shipping'
  return 'Return shipping to be confirmed'
}

const renderDetailRow = (label: string, value: string) => `
  <tr>
    <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:12px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.08em;vertical-align:top;width:42%;">${escapeHtml(label)}</td>
    <td style="padding:12px 0;border-bottom:1px solid #e5e7eb;font-size:14px;font-weight:600;color:#111827;line-height:1.45;vertical-align:top;">${escapeHtml(value)}</td>
  </tr>
`

const renderReturnReceivedEmail = ({
  brandName,
  brandLogoUrl,
  customerName,
  returnRef,
  orderNumber,
  itemSummary,
  reason,
  resolution,
  shippingPayer,
  customerMessage,
  proofCount,
}: {
  brandName: string
  brandLogoUrl?: string
  customerName: string
  returnRef: string
  orderNumber: string
  itemSummary: string
  reason: string
  resolution: string
  shippingPayer: string
  customerMessage: string
  proofCount: number
}) => {
  const firstName = getFirstName(customerName)
  const preheader = `${brandName} received your return request ${returnRef}.`

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Return request received</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;-webkit-font-smoothing:antialiased;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f9fafb;padding:40px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;margin:0 auto;background-color:#ffffff;padding:40px;border:1px solid #e5e7eb;border-radius:12px;">
                <tr>
                  <td>
                    <div style="text-align:left;margin-bottom:28px;">
                      ${brandLogoUrl
                        ? `<img src="${brandLogoUrl}" alt="${escapeHtml(brandName)}" style="max-width:140px;max-height:40px;width:auto;height:auto;display:inline-block;border:0;outline:none;text-decoration:none;" />`
                        : `<div style="font-weight:700;font-size:24px;letter-spacing:-0.03em;color:#111827;">${escapeHtml(brandName)}</div>`
                      }
                    </div>
                    <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:12px;">Return request received</div>
                    <h1 style="font-size:26px;font-weight:600;line-height:1.25;margin:0 0 12px 0;color:#111827;letter-spacing:-0.02em;">Hi ${escapeHtml(firstName)}, we received your return request</h1>
                    <p style="font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 24px 0;">${escapeHtml(brandName)} has received your request and will review the details. We will contact you with the next step once the return is checked.</p>
                    <div style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px;">
                      <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Return reference</div>
                      <div style="font-size:18px;font-weight:700;color:#111827;">${escapeHtml(returnRef)}</div>
                      <div style="font-size:12px;color:#6b7280;margin-top:6px;">Linked order ${escapeHtml(orderNumber)}</div>
                    </div>
                    <div style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px;">
                      <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">Submission details</div>
                      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                        ${renderDetailRow('Item', itemSummary)}
                        ${renderDetailRow('Reason', reason)}
                        ${renderDetailRow('Requested outcome', resolution)}
                        ${renderDetailRow('Return shipping', shippingPayer)}
                        ${renderDetailRow('Proof attached', `${proofCount} image${proofCount === 1 ? '' : 's'}`)}
                      </table>
                    </div>
                    ${customerMessage ? `
                      <div style="background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:32px;">
                        <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:10px;">Your note</div>
                        <div style="font-size:14px;line-height:1.65;color:#374151;">${renderNote(customerMessage)}</div>
                      </div>
                    ` : ''}
                    <div style="text-align:left;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:24px;line-height:1.6;letter-spacing:0.02em;">
                      You are receiving this because a return request was submitted for this order.<br />
                      <div style="margin-top:10px;">
                        <img src="${FYLL_WORDMARK_URL}" alt="Fyll" style="max-width:92px;max-height:24px;width:auto;height:auto;display:inline-block;border:0;outline:none;text-decoration:none;" />
                      </div>
                      <div style="margin-top:6px;">Powered by Fyll</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `
}

const sendEmail = async ({
  toEmail,
  subject,
  html,
  text,
  fromName,
}: {
  toEmail: string
  subject: string
  html: string
  text: string
  fromName: string
}) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${RESEND_FROM_EMAIL}>`,
      to: [toEmail],
      subject,
      html,
      text,
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`Resend failed: ${JSON.stringify(payload)}`)
  }
}

const sendOneSignalNotification = async ({
  recipients,
  heading,
  content,
  data,
  collapseId,
}: {
  recipients: string[]
  heading: string
  content: string
  data: Record<string, unknown>
  collapseId?: string
}) => {
  if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY || recipients.length === 0) {
    return {
      mode: 'skipped',
      reason: !ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY ? 'missing-onesignal-config' : 'no-recipients',
      deliveredCount: 0,
    }
  }

  const isV2Key = ONESIGNAL_REST_API_KEY.startsWith('os_v2_')
  const authHeader = isV2Key
    ? `Key ${ONESIGNAL_REST_API_KEY}`
    : `Basic ${ONESIGNAL_REST_API_KEY}`

  const response = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
      'Idempotency-Key': `return-request:${String(data.returnId ?? '')}:${recipients.slice().sort().join(',')}`,
    },
    body: JSON.stringify({
      app_id: ONESIGNAL_APP_ID,
      headings: { en: heading },
      contents: { en: content },
      data,
      ...(collapseId ? { collapse_id: collapseId } : {}),
      include_aliases: { external_id: recipients },
      target_channel: 'push',
    }),
  })

  const result = await response.json().catch(() => ({}))
  if (response.ok) {
    const deliveredCount = typeof (result as { recipients?: unknown }).recipients === 'number'
      ? ((result as { recipients?: number }).recipients ?? recipients.length)
      : recipients.length
    return { mode: 'pushed', deliveredCount, result }
  }

  console.warn('Return request OneSignal notification failed:', result)
  return { mode: 'failed', deliveredCount: 0, result }
}

const listBusinessNotificationRecipientIds = async (
  admin: ReturnType<typeof getAdminClient>,
  businessId: string,
) => {
  const aliases = getBusinessIdAliases(businessId)
  if (aliases.length === 0) return []

  const normalizedBusinessId = compactBusinessId(businessId)
  const recipientIds = new Set<string>()

  const { data: profiles, error: profilesError } = await admin
    .from('profiles')
    .select('id,business_id')
    .in('business_id', aliases)

  if (profilesError) throw profilesError

  ;(profiles ?? []).forEach((row: { id?: string | null; business_id?: string | null }) => {
    if (compactBusinessId(row.business_id) !== normalizedBusinessId) return
    const userId = toTrimmedString(row.id)
    if (userId) recipientIds.add(userId)
  })

  const { data: teamMembers, error: teamMembersError } = await admin
    .from('team_members')
    .select('user_id,business_id')
    .in('business_id', aliases)

  if (teamMembersError) throw teamMembersError

  ;(teamMembers ?? []).forEach((row: { user_id?: string | null; business_id?: string | null }) => {
    if (compactBusinessId(row.business_id) !== normalizedBusinessId) return
    const userId = toTrimmedString(row.user_id)
    if (userId) recipientIds.add(userId)
  })

  return Array.from(recipientIds)
}

const notifyTeamReturnSubmitted = async ({
  admin,
  businessId,
  returnId,
  returnRef,
  caseId,
  orderNumber,
  customerName,
  reason,
}: {
  admin: ReturnType<typeof getAdminClient>
  businessId: string
  returnId: string
  returnRef: string
  caseId: string
  orderNumber: string
  customerName: string
  reason: string
}) => {
  const recipientUserIds = await listBusinessNotificationRecipientIds(admin, businessId)
  if (recipientUserIds.length === 0) {
    return { skipped: true, reason: 'no-recipients' }
  }

  const customerLabel = customerName || 'A customer'
  const notificationPayload = {
    type: 'return_request_submitted',
    entityType: 'return',
    entityId: returnId,
    returnId,
    returnRef,
    caseId,
    orderNumber,
    customerName: customerLabel,
    reason,
    body: `${customerLabel} submitted ${returnRef} for ${orderNumber}.`,
  }

  const { error } = await admin
    .from('collaboration_notifications')
    .insert(recipientUserIds.map((recipientUserId) => ({
      business_id: businessId,
      user_id: recipientUserId,
      actor_user_id: null,
      event_type: 'reply',
      payload: notificationPayload,
    })))

  if (error) throw error

  const push = await sendOneSignalNotification({
    recipients: recipientUserIds,
    heading: 'New return request',
    content: `${customerLabel} submitted ${returnRef}.`,
    data: notificationPayload,
    collapseId: `return-request:${returnId}`,
  })

  return { notified: recipientUserIds.length, push }
}

const getBusiness = async (admin: ReturnType<typeof getAdminClient>, businessId: string) => {
  const { data, error } = await admin
    .from('businesses')
    .select('id, name, data')
    .eq('id', businessId)
    .maybeSingle()

  if (error) throw error
  return data as DataRow | null
}

const getReturn = async (admin: ReturnType<typeof getAdminClient>, businessId: string, returnId: string) => {
  const { data, error } = await admin
    .from('returns')
    .select('id, business_id, data')
    .eq('business_id', businessId)
    .eq('id', returnId)
    .maybeSingle()

  if (error) throw error
  return data as DataRow | null
}

const updateReturnData = async (
  admin: ReturnType<typeof getAdminClient>,
  row: DataRow,
  nextData: Record<string, unknown>,
) => {
  const { error } = await admin
    .from('returns')
    .update({
      data: nextData,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id)
    .eq('business_id', row.business_id)

  if (error) throw error
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return jsonResponse(500, { error: 'Email service is not configured.' })
  }

  try {
    const payload = await req.json().catch(() => null) as ReturnEmailPayload | null
    const type = payload?.type || 'return_received'
    const businessId = toTrimmedString(payload?.businessId)
    const returnId = toTrimmedString(payload?.returnId)

    if (type !== 'return_received' || !businessId || !returnId) {
      return jsonResponse(400, { error: 'Missing type, businessId, or returnId.' })
    }

    const admin = getAdminClient()
    const returnRow = await getReturn(admin, businessId, returnId)
    if (!returnRow?.data) return jsonResponse(404, { error: 'Return request not found.' })

    const returnItem = returnRow.data
    const customerEmail = toTrimmedString(returnItem.customerEmail).toLowerCase()
    if (!customerEmail || !customerEmail.includes('@')) {
      return jsonResponse(200, { skipped: true, reason: 'missing-customer-email' })
    }

    if (toTrimmedString(returnItem.returnReceivedEmailSentAt)) {
      return jsonResponse(200, { skipped: true, reason: 'already-sent' })
    }

    const businessRow = await getBusiness(admin, businessId)
    const businessData = businessRow?.data ?? {}
    const businessName = normalizeBusinessName(
      toTrimmedString(businessData.businessName)
      || toTrimmedString(businessRow?.name)
      || 'Fyll'
    )
    const businessLogoUrl = normalizeEmailImageUrl(businessData.businessLogo)
    const returnRef = toTrimmedString(returnItem.ref) || returnId
    const orderNumber = toTrimmedString(returnItem.orderNumber) || 'your order'
    const reason = reasonLabel(toTrimmedString(returnItem.reason), toTrimmedString(returnItem.otherReason))
    const resolution = resolutionLabel(toTrimmedString(returnItem.resolution))
    const shippingPayer = shippingPayerLabel(toTrimmedString(returnItem.shippingPayer))
    const proofCount = Array.isArray(returnItem.proofImages) ? returnItem.proofImages.length : 0
    const itemSummary = toTrimmedString(returnItem.itemSummary) || 'Order item'
    const customerName = toTrimmedString(returnItem.customerName) || 'there'
    const customerMessage = toTrimmedString(returnItem.customerMessage)

    const html = renderReturnReceivedEmail({
      brandName: businessName,
      brandLogoUrl: businessLogoUrl,
      customerName,
      returnRef,
      orderNumber,
      itemSummary,
      reason,
      resolution,
      shippingPayer,
      customerMessage,
      proofCount,
    })

    const text = [
      `Hi ${getFirstName(customerName)},`,
      '',
      `${businessName} received your return request.`,
      `Return reference: ${returnRef}`,
      `Order: ${orderNumber}`,
      `Item: ${itemSummary}`,
      `Reason: ${reason}`,
      `Requested outcome: ${resolution}`,
      `Return shipping: ${shippingPayer}`,
      `Proof attached: ${proofCount} image${proofCount === 1 ? '' : 's'}`,
      customerMessage ? `Note: ${customerMessage}` : '',
    ].filter(Boolean).join('\n')

    await sendEmail({
      toEmail: customerEmail,
      fromName: buildSenderName(businessName),
      subject: `Return request received - ${returnRef}`,
      html,
      text,
    })

    let teamNotification: unknown = null
    try {
      teamNotification = await notifyTeamReturnSubmitted({
        admin,
        businessId,
        returnId,
        returnRef,
        caseId: toTrimmedString(returnItem.caseId),
        orderNumber,
        customerName,
        reason,
      })
    } catch (notificationError) {
      console.warn(
        'Return request team notification failed:',
        notificationError instanceof Error ? notificationError.message : String(notificationError),
      )
    }

    const nowIso = new Date().toISOString()
    await updateReturnData(admin, returnRow, {
      ...returnItem,
      returnReceivedEmailSentAt: nowIso,
      updatedAt: nowIso,
    })

    return jsonResponse(200, { ok: true, teamNotification })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Return email failed:', message)
    return jsonResponse(500, { error: message })
  }
})
