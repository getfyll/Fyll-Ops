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

type RequestPayload = {
  businessId?: string
  orderId?: string
  previousStatus?: string
  newStatus?: string
}

type OrderRow = {
  id: string
  business_id: string | null
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
const toBoolean = (value: unknown) => value === true
const getFirstName = (value: string) => toTrimmedString(value).split(/\s+/).filter(Boolean)[0] || 'there'
const normalizeBusinessName = (value: string) => value.trim() || 'Fyll'
const buildSenderName = (businessName: string) => `${normalizeBusinessName(businessName)} - Fyll`

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

const normalizeSlug = (value: string) => (
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
)

const buildTrackingUrl = ({
  code,
  email,
  businessSlug,
}: {
  code: string
  email?: string | null
  businessSlug?: string | null
}) => {
  const normalizedBusinessSlug = normalizeSlug(businessSlug ?? '')
  const pathname = normalizedBusinessSlug
    ? `/${normalizedBusinessSlug}/order-tracking/${encodeURIComponent(code)}`
    : '/order-tracking'
  const url = new URL(pathname, APP_BASE_URL)
  if (!normalizedBusinessSlug) {
    url.searchParams.set('code', code)
  }
  if (email?.trim()) {
    url.searchParams.set('email', email.trim())
  }
  return url.toString()
}

const renderEmailShell = ({
  brandName,
  brandLogoUrl,
  preheader,
  eyebrow,
  title,
  subtitle,
  highlightLabel,
  highlightValue,
  ctaLabel,
  ctaUrl,
  footerNote,
}: {
  brandName: string
  brandLogoUrl?: string
  preheader: string
  eyebrow?: string
  title: string
  subtitle: string
  highlightLabel: string
  highlightValue: string
  ctaLabel: string
  ctaUrl: string
  footerNote: string
}) => `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${escapeHtml(title)}</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#111827;-webkit-font-smoothing:antialiased;">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f9fafb;padding:40px 0;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:500px;margin:0 auto;background-color:#ffffff;padding:48px;border:1px solid #e5e7eb;border-radius:12px;">
                <tr>
                  <td>
                    <div style="text-align:center;margin-bottom:32px;">
                      ${brandLogoUrl
                        ? `<img src="${brandLogoUrl}" alt="${escapeHtml(brandName)}" style="max-width:140px;max-height:40px;width:auto;height:auto;display:inline-block;border:0;outline:none;text-decoration:none;" />`
                        : `<div style="font-weight:700;font-size:24px;letter-spacing:-0.03em;color:#111827;">${escapeHtml(brandName)}</div>`
                      }
                    </div>
                    ${eyebrow ? `<div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;text-align:center;margin-bottom:14px;">${escapeHtml(eyebrow)}</div>` : ''}
                    <h1 style="font-size:26px;font-weight:600;line-height:1.25;margin:0 0 16px 0;color:#111827;text-align:center;letter-spacing:-0.02em;">${escapeHtml(title)}</h1>
                    <p style="font-size:15px;line-height:1.6;color:#4b5563;margin:0 0 32px 0;text-align:center;">${escapeHtml(subtitle)}</p>
                    <div style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:24px;margin-bottom:32px;text-align:center;">
                      <div style="font-size:11px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">${escapeHtml(highlightLabel)}</div>
                      <div style="font-size:16px;font-weight:600;color:#111827;">${escapeHtml(highlightValue)}</div>
                    </div>
                    <div style="text-align:center;margin-bottom:40px;">
                      <a href="${ctaUrl}" style="display:inline-block;background-color:#000000;color:#ffffff !important;text-decoration:none;font-weight:500;padding:15px 36px;border-radius:9999px;font-size:14px;text-align:center;">${escapeHtml(ctaLabel)}</a>
                    </div>
                    <div style="text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:24px;line-height:1.6;letter-spacing:0.02em;">
                      ${escapeHtml(footerNote)}<br />
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

const buildOrderStatusEmail = ({
  customerName,
  businessName,
  businessLogoUrl,
  orderLabel,
  newStatus,
  trackingUrl,
}: {
  customerName: string
  businessName: string
  businessLogoUrl?: string
  orderLabel: string
  newStatus: string
  trackingUrl: string
}) => ({
  subject: `Order update: ${orderLabel} is now ${newStatus}`,
  html: renderEmailShell({
    brandName: businessName,
    brandLogoUrl: businessLogoUrl,
    preheader: `${orderLabel} is now ${newStatus}.`,
    eyebrow: 'Order status update',
    title: `Hi ${getFirstName(customerName)}, your order status changed`,
    subtitle: `${businessName} has updated ${orderLabel} to a new status.`,
    highlightLabel: 'Current status',
    highlightValue: newStatus,
    ctaLabel: 'Track Your Order',
    ctaUrl: trackingUrl,
    footerNote: `This update is for ${customerName}.`,
  }),
  text: [
    `Hi ${getFirstName(customerName)},`,
    '',
    `Your ${businessName} order ${orderLabel} is now: ${newStatus}`,
    `Track your order: ${trackingUrl}`,
  ].join('\n'),
})

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
  fromName?: string | null
}) => {
  const normalizedFromName = toTrimmedString(fromName) || 'Fyll'
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${normalizedFromName} <${RESEND_FROM_EMAIL}>`,
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return jsonResponse(500, { error: 'Order status email is not configured.' })
  }

  try {
    const payload = await req.json() as RequestPayload
    const businessId = toTrimmedString(payload.businessId)
    const orderId = toTrimmedString(payload.orderId)
    const newStatus = toTrimmedString(payload.newStatus)

    if (!businessId || !orderId || !newStatus) {
      return jsonResponse(400, { error: 'businessId, orderId, and newStatus are required.' })
    }

    const admin = getAdminClient()

    const { data: businessRow, error: businessError } = await admin
      .from('businesses')
      .select('id,name,data')
      .eq('id', businessId)
      .maybeSingle()

    if (businessError) throw businessError
    if (!businessRow) {
      return jsonResponse(404, { error: 'Business not found.' })
    }

    const businessData = (businessRow.data ?? {}) as Record<string, unknown>

    const { data: businessSettingsRow, error: businessSettingsError } = await admin
      .from('business_settings')
      .select('data')
      .eq('business_id', businessId)
      .eq('id', 'global')
      .maybeSingle()

    if (businessSettingsError) throw businessSettingsError

    const businessSettingsData = (businessSettingsRow?.data ?? {}) as Record<string, unknown>

    if (!toBoolean(businessSettingsData.orderStatusEmailEnabled)) {
      return jsonResponse(200, { sent: false, reason: 'order-status-emails-disabled' })
    }

    const { data: orderRow, error: orderError } = await admin
      .from('orders')
      .select('id,business_id,data')
      .eq('id', orderId)
      .eq('business_id', businessId)
      .maybeSingle() as { data: OrderRow | null; error: unknown }

    if (orderError) throw orderError
    if (!orderRow) {
      return jsonResponse(404, { error: 'Order not found.' })
    }

    const order = orderRow.data ?? {}
    const customerEmail = toTrimmedString(order.customerEmail).toLowerCase()
    if (!customerEmail) {
      return jsonResponse(200, { sent: false, reason: 'missing-customer-email' })
    }

    const customerName = toTrimmedString(order.customerName) || 'there'
    const businessName = normalizeBusinessName(
      toTrimmedString(businessData.businessName) || toTrimmedString(businessRow.name)
    )
    const businessSlug = normalizeSlug(
      toTrimmedString(businessData.businessSlug) || toTrimmedString(businessData.businessName) || toTrimmedString(businessRow.name)
    )
    const businessLogoUrl = normalizeEmailImageUrl(businessData.businessLogo)
    const orderLabel = toTrimmedString(order.websiteOrderReference)
      || toTrimmedString(order.orderNumber)
      || toTrimmedString(order.customerTrackingCode)
      || orderId
    const code = toTrimmedString(order.customerTrackingCode)
      || toTrimmedString(order.websiteOrderReference)
      || toTrimmedString(order.orderNumber)
      || orderId
    const trackingUrl = buildTrackingUrl({ code, email: customerEmail, businessSlug })

    const emailContent = buildOrderStatusEmail({
      customerName,
      businessName,
      businessLogoUrl,
      orderLabel,
      newStatus,
      trackingUrl,
    })

    await sendEmail({
      toEmail: customerEmail,
      fromName: buildSenderName(businessName),
      ...emailContent,
    })

    return jsonResponse(200, { sent: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('send-order-status-email failed:', message)
    return jsonResponse(500, { error: message })
  }
})
