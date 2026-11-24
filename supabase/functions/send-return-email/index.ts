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
const FYLL_ONESIGNAL_APP_ID = sanitizeEnvValue(Deno.env.get('FYLL_ONESIGNAL_APP_ID'))
const FYLL_ONESIGNAL_REST_API_KEY = sanitizeEnvValue(Deno.env.get('FYLL_ONESIGNAL_REST_API_KEY'))
const DASHBOARD_ONESIGNAL_APP_ID = sanitizeEnvValue(Deno.env.get('DASHBOARD_ONESIGNAL_APP_ID')) || FYLL_ONESIGNAL_APP_ID
const DASHBOARD_ONESIGNAL_REST_API_KEY = sanitizeEnvValue(Deno.env.get('DASHBOARD_ONESIGNAL_REST_API_KEY')) || FYLL_ONESIGNAL_REST_API_KEY
const WWW_ONESIGNAL_APP_ID = sanitizeEnvValue(Deno.env.get('WWW_ONESIGNAL_APP_ID') ?? Deno.env.get('ONESIGNAL_APP_ID'))
const WWW_ONESIGNAL_REST_API_KEY = sanitizeEnvValue(Deno.env.get('WWW_ONESIGNAL_REST_API_KEY') ?? Deno.env.get('ONESIGNAL_REST_API_KEY'))
const MAIN_ONESIGNAL_CONFIGS = [
  { origin: 'https://dashboard.fyll.app', appId: DASHBOARD_ONESIGNAL_APP_ID, restApiKey: DASHBOARD_ONESIGNAL_REST_API_KEY },
  { origin: 'https://fyll.app', appId: FYLL_ONESIGNAL_APP_ID, restApiKey: FYLL_ONESIGNAL_REST_API_KEY },
  { origin: 'https://www.fyll.app', appId: WWW_ONESIGNAL_APP_ID, restApiKey: WWW_ONESIGNAL_REST_API_KEY },
]
  .filter((config) => config.appId && config.restApiKey)
  .filter((config, index, configs) => configs.findIndex((candidate) => candidate.appId === config.appId) === index)
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
  if (value === 'damaged') return 'Damaged or scratched'
  if (value === 'wrong_size') return 'Wrong size or fit'
  if (value === 'missing_part') return 'Missing part'
  if (value === 'changed_mind') return 'Changed mind'
  if (value === 'other') return otherReason || 'Other reason'
  return value || 'Return request'
}

const resolutionLabel = (value: string) => {
  if (value === 'replacement') return 'Replacement'
  if (value === 'refund') return 'Refund'
  if (value === 'exchange') return 'Exchange'
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Not specified'
}

const shippingPayerLabel = (value: string, brandName: string) => {
  if (value === 'seller') return `Paid by ${brandName}`
  if (value === 'customer') return 'Paid by you'
  return 'To be confirmed'
}

// The last step depends on what the customer asked for.
const finalStep = (resolution: string) => {
  if (resolution === 'refund') return 'Your refund is sent once the item is back with them.'
  if (resolution === 'exchange') return 'Your exchange is sent once the item is back with them.'
  if (resolution === 'replacement') return 'Your replacement is sent once the item is back with them.'
  return 'They sort it out once the item is back with them.'
}

const TRACK_ORIGIN = 'https://track.fyll.app'
const buildTrackUrl = (orderNumber: string, email: string, businessSlug: string) => {
  if (!orderNumber) return ''
  const slug = businessSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  const url = new URL(slug ? `/${slug}/order-tracking/${encodeURIComponent(orderNumber)}` : '/order-tracking', TRACK_ORIGIN)
  if (!slug) url.searchParams.set('code', orderNumber)
  if (email) url.searchParams.set('email', email)
  return url.toString()
}

// Same layout as the newer Fyll emails (send-case-email), kept plain: black, white and warm grey,
// set in Public Sans, no lime. The business is the sender, so the header carries its logo and name.
const FONT = "'Public Sans',-apple-system,'Segoe UI',system-ui,sans-serif"
const LABEL_STYLE = 'font-size:12.5px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:#6b6c63;'

const renderRows = (rows: { label: string; value: string; html?: boolean }[]) => rows.filter((row) => row.value).map((row, index, list) => `
  <tr>
    <td valign="top" style="padding:14px 0;${index < list.length - 1 ? 'border-bottom:1px solid rgba(30,30,30,0.07);' : ''}font-size:14px;color:#6b6c63;width:38%;">${escapeHtml(row.label)}</td>
    <td valign="top" align="right" style="padding:14px 0;${index < list.length - 1 ? 'border-bottom:1px solid rgba(30,30,30,0.07);' : ''}font-size:15px;color:#1e1e1e;line-height:1.5;text-align:right;">${row.html ? row.value : escapeHtml(row.value)}</td>
  </tr>`).join('')

const renderPhotos = (urls: string[]) => {
  if (urls.length === 0) return ''
  const thumbs = urls.map((url, index) => `<a href="${escapeHtml(url)}" target="_blank" title="Open photo ${index + 1}" style="display:inline-block;margin:0 0 6px 6px;text-decoration:none;"><img src="${escapeHtml(url)}" alt="Photo ${index + 1}" width="56" height="56" style="display:block;width:56px;height:56px;border-radius:12px;object-fit:cover;border:1px solid rgba(30,30,30,0.08);" /></a>`).join('')
  return `${thumbs}<div style="font-size:12.5px;color:#8c8d84;">Tap a photo to open it</div>`
}

const renderReturnReceivedEmail = ({
  brandName,
  brandLogoUrl,
  customerName,
  returnRef,
  orderNumber,
  itemSummary,
  reason,
  resolution,
  resolutionValue,
  shippingPayer,
  customerMessage,
  photoUrls,
  trackUrl,
}: {
  brandName: string
  brandLogoUrl?: string
  customerName: string
  returnRef: string
  orderNumber: string
  itemSummary: string
  reason: string
  resolution: string
  resolutionValue: string
  shippingPayer: string
  customerMessage: string
  photoUrls: string[]
  trackUrl: string
}) => {
  const firstName = getFirstName(customerName)
  const safeBrand = escapeHtml(brandName)
  const heading = firstName && firstName !== 'there' ? `Hi ${firstName}, we've got your return request` : "We've got your return request"
  const preheader = `${brandName} has your return request ${returnRef}.`
  const logo = brandLogoUrl
    ? `<img src="${escapeHtml(brandLogoUrl)}" alt="${safeBrand}" width="44" height="44" style="display:block;width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid #e3e3de;" />`
    : `<span style="display:block;width:44px;height:44px;line-height:44px;border-radius:50%;background:#1e1e1e;color:#ffffff;font-size:19px;font-weight:600;text-align:center;">${escapeHtml(brandName.charAt(0).toUpperCase() || 'F')}</span>`
  const steps = [
    `${brandName} checks your request${photoUrls.length ? ' and photos' : ''}.`,
    `They email you to confirm the ${resolution.toLowerCase()} and how to send the item back.`,
    finalStep(resolutionValue),
  ]
  const helpUrl = APP_BASE_URL ? escapeHtml(new URL('/help', APP_BASE_URL).toString()) : ''
  const privacyUrl = APP_BASE_URL ? escapeHtml(new URL('/privacy', APP_BASE_URL).toString()) : ''

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="color-scheme" content="light only" />
    <meta name="supported-color-schemes" content="light only" />
    <title>${escapeHtml(heading)}</title>
    <link href="https://fonts.googleapis.com/css2?family=Public+Sans:wght@400;500;600;700;800&amp;display=swap" rel="stylesheet" />
    <style>
      :root { color-scheme: light only; supported-color-schemes: light only; }
      body, table, td, a, div, p, span { font-family:${FONT}; }
      @media only screen and (max-width:640px) {
        .email-wrap { padding:18px 12px 28px !important; }
        .email-card { border-radius:22px !important; }
        .head { padding:24px 22px 0 !important; }
        .content { padding:20px 22px 30px !important; }
        .title, .ref-value { font-size:26px !important; letter-spacing:-0.6px !important; }
        .footer { padding:22px 22px 26px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;color:#1e1e1e;-webkit-font-smoothing:antialiased;font-family:${FONT};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#ffffff;border-collapse:collapse;">
      <tr>
        <td class="email-wrap" align="center" style="padding:32px 20px 40px;">
          <table role="presentation" class="email-card" width="640" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border:1px solid #e3e3de;border-radius:28px;overflow:hidden;box-shadow:0 20px 50px rgba(30,30,30,0.08);border-collapse:separate;">
            <tr>
              <td class="head" style="padding:30px 40px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">
                  <tr>
                    <td valign="middle">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="border-collapse:collapse;">
                        <tr>
                          <td valign="middle" style="padding-right:12px;">${logo}</td>
                          <td valign="middle" style="font-size:18px;font-weight:600;color:#1e1e1e;">${safeBrand}</td>
                        </tr>
                      </table>
                    </td>
                    <td align="right" valign="middle">
                      <span style="display:inline-block;padding:7px 13px;border-radius:999px;background:#f6f6f1;border:1px solid rgba(30,30,30,0.06);color:#55564e;font-size:12.5px;font-weight:600;white-space:nowrap;">Return request</span>
                    </td>
                  </tr>
                </table>
                <div class="title" style="margin:30px 0 0;font-weight:700;font-size:30px;letter-spacing:-0.8px;color:#1e1e1e;line-height:1.1;">${escapeHtml(heading)}</div>
              </td>
            </tr>
            <tr>
              <td class="content" style="padding:20px 40px 36px;">
                <p style="margin:0 0 22px;font-size:16.5px;line-height:1.6;color:#3a3b35;">${safeBrand} will look at it and reply by email with the next step. Please keep the item and its packaging until then.</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;table-layout:fixed;margin:0 0 22px;background:#f6f6f1;border:1px solid rgba(30,30,30,0.06);border-radius:20px;border-collapse:separate;">
                  <tr>
                    <td width="62%" valign="middle" style="width:62%;padding:20px 8px 20px 22px;">
                      <div style="${LABEL_STYLE}margin-bottom:4px;">Return reference</div>
                      <div class="ref-value" style="font-weight:700;font-size:30px;letter-spacing:-0.8px;line-height:1.1;color:#1e1e1e;word-break:break-all;">${escapeHtml(returnRef)}</div>
                    </td>
                    <td width="38%" align="right" valign="middle" style="width:38%;padding:20px 22px 20px 8px;font-size:14px;color:#6b6c63;line-height:1.5;text-align:right;">For order<br />${escapeHtml(orderNumber)}</td>
                  </tr>
                </table>

                <div style="${LABEL_STYLE}margin-bottom:10px;">What you sent</div>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 22px;border:1px solid rgba(30,30,30,0.08);border-radius:20px;border-collapse:separate;">
                  <tr><td style="padding:4px 22px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">${renderRows([
                    { label: 'Item', value: itemSummary },
                    { label: 'Problem', value: reason },
                    { label: 'You asked for', value: resolution },
                    { label: 'Return shipping', value: shippingPayer },
                    { label: 'Photos', value: renderPhotos(photoUrls), html: true },
                  ])}</table></td></tr>
                </table>

                ${customerMessage ? `
                <div style="${LABEL_STYLE}margin-bottom:10px;">Your note</div>
                <div style="margin:0 0 22px;border:1px solid rgba(30,30,30,0.08);border-radius:20px;padding:18px 22px;font-size:15px;line-height:1.6;color:#3a3b35;">${renderNote(customerMessage)}</div>` : ''}

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 ${trackUrl ? '22px' : '0'};background:#f6f6f1;border-radius:20px;border-collapse:separate;">
                  <tr><td colspan="2" style="padding:22px 22px 14px;${LABEL_STYLE}">What happens next</td></tr>
                  ${steps.map((step, index) => `
                  <tr>
                    <td valign="top" style="padding:0 14px ${index === steps.length - 1 ? '22px' : '14px'} 22px;width:28px;"><span style="display:block;width:28px;height:28px;line-height:28px;border-radius:50%;background:${index === 0 ? '#1e1e1e' : 'rgba(30,30,30,0.07)'};color:${index === 0 ? '#ffffff' : '#55564e'};font-size:13px;font-weight:600;text-align:center;">${index + 1}</span></td>
                    <td valign="top" style="padding:3px 22px ${index === steps.length - 1 ? '22px' : '14px'} 0;font-size:15px;line-height:1.5;color:#3a3b35;">${escapeHtml(step)}</td>
                  </tr>`).join('')}
                </table>

                ${trackUrl ? `
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:separate;">
                  <tr>
                    <td align="center" bgcolor="#1e1e1e" style="height:56px;border-radius:999px;">
                      <a href="${escapeHtml(trackUrl)}" style="display:block;padding:16px 20px;color:#ffffff !important;font-size:16px;font-weight:600;text-decoration:none;line-height:24px;">Track my order</a>
                    </td>
                  </tr>
                </table>` : ''}
                <div style="margin:12px 0 0;text-align:center;font-size:13.5px;color:#6b6c63;line-height:1.45;">Questions? Contact ${safeBrand} and quote ${escapeHtml(returnRef)}.</div>
              </td>
            </tr>
            <tr>
              <td class="footer" style="padding:22px 40px 28px;border-top:1px solid rgba(30,30,30,0.07);">
                ${FYLL_WORDMARK_URL ? `
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 10px;border-collapse:collapse;">
                  <tr>
                    <td valign="middle" style="padding-right:8px;font-size:13px;color:#6b6c63;">Handled with</td>
                    <td valign="middle"><img src="${escapeHtml(FYLL_WORDMARK_URL)}" alt="Fyll" width="39" height="22" style="display:block;width:39px;height:22px;border:0;" /></td>
                  </tr>
                </table>` : ''}
                <div style="font-size:12.5px;line-height:1.55;color:#8c8d84;margin-bottom:10px;">You're getting this because a return was started for an order you placed with ${safeBrand}.</div>
                ${helpUrl ? `<div style="font-size:12.5px;"><a href="${helpUrl}" style="color:#55564e;margin-right:16px;">Help</a><a href="${privacyUrl}" style="color:#55564e;">Privacy</a></div>` : ''}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`
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

const sendOneSignalNotificationForApp = async ({
  recipients,
  heading,
  content,
  data,
  collapseId,
  origin,
  appId,
  restApiKey,
}: {
  recipients: string[]
  heading: string
  content: string
  data: Record<string, unknown>
  collapseId?: string
  origin: string
  appId: string
  restApiKey: string
}) => {
  if (recipients.length === 0) {
    return {
      origin,
      mode: 'skipped',
      reason: 'no-recipients',
      deliveredCount: 0,
    }
  }

  const isV2Key = restApiKey.startsWith('os_v2_')
  const authHeader = isV2Key
    ? `Key ${restApiKey}`
    : `Basic ${restApiKey}`

  const response = await fetch('https://api.onesignal.com/notifications', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
      'Idempotency-Key': `return-request:${appId}:${String(data.returnId ?? '')}:${recipients.slice().sort().join(',')}`,
    },
    body: JSON.stringify({
      app_id: appId,
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
    return { origin, mode: 'pushed', deliveredCount, result }
  }

  console.warn(`Return request OneSignal notification failed for ${origin}:`, result)
  return { origin, mode: 'failed', deliveredCount: 0, result }
}

const sendOneSignalNotification = async (args: {
  recipients: string[]
  heading: string
  content: string
  data: Record<string, unknown>
  collapseId?: string
}) => {
  if (args.recipients.length === 0 || MAIN_ONESIGNAL_CONFIGS.length === 0) {
    return {
      mode: 'skipped',
      reason: args.recipients.length === 0 ? 'no-recipients' : 'missing-onesignal-config',
      deliveredCount: 0,
      deliveries: [],
    }
  }

  const deliveries = await Promise.all(MAIN_ONESIGNAL_CONFIGS.map((config) => (
    sendOneSignalNotificationForApp({ ...args, ...config })
  )))
  const deliveredCount = deliveries.reduce((total, delivery) => total + delivery.deliveredCount, 0)

  return {
    mode: deliveries.some((delivery) => delivery.mode === 'pushed') ? 'pushed' : 'failed',
    deliveredCount,
    deliveries,
  }
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
    const resolutionValue = toTrimmedString(returnItem.resolution)
    const resolution = resolutionLabel(resolutionValue)
    const shippingPayer = shippingPayerLabel(toTrimmedString(returnItem.shippingPayer), businessName)
    const photoUrls = (Array.isArray(returnItem.proofImages) ? returnItem.proofImages : [])
      .map((value: unknown) => toTrimmedString(value))
      .filter((value: string) => /^https:\/\//i.test(value))
      .slice(0, 6)
    const proofCount = photoUrls.length
    const itemSummary = toTrimmedString(returnItem.itemSummary) || 'Order item'
    const customerName = toTrimmedString(returnItem.customerName) || 'there'
    const customerMessage = toTrimmedString(returnItem.customerMessage)
    const businessSlug = toTrimmedString(businessData.businessSlug) || toTrimmedString(businessData.storefrontSlug)
    const trackUrl = buildTrackUrl(orderNumber, customerEmail, businessSlug)

    const html = renderReturnReceivedEmail({
      brandName: businessName,
      brandLogoUrl: businessLogoUrl,
      customerName,
      returnRef,
      orderNumber,
      itemSummary,
      reason,
      resolution,
      resolutionValue,
      shippingPayer,
      customerMessage,
      photoUrls,
      trackUrl,
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
      `Photos: ${proofCount}`,
      trackUrl ? `Track your order: ${trackUrl}` : '',
      customerMessage ? `Note: ${customerMessage}` : '',
    ].filter(Boolean).join('\n')

    await sendEmail({
      toEmail: customerEmail,
      fromName: buildSenderName(businessName),
      subject: `We've got your return request · ${returnRef}`,
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
