// Customer emails for cases: "case opened", "replacement on its way", refund / credit, and "case resolved".
// Only the customer-facing summary and resolution are ever sent: never priority, staff notes, comments or assignee.
// The caller must be signed in to the business that owns the case.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const sanitizeEnvValue = (value: string | undefined | null) => (
  (value ?? '').normalize('NFKC').replace(/[^\x20-\x7E]/g, '').trim()
)

const SUPABASE_URL = sanitizeEnvValue(Deno.env.get('SUPABASE_URL'))
const SUPABASE_SERVICE_ROLE_KEY = sanitizeEnvValue(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
const RESEND_API_KEY = sanitizeEnvValue(Deno.env.get('RESEND_API_KEY'))
const RESEND_FROM_EMAIL = sanitizeEnvValue(Deno.env.get('RESEND_FROM_EMAIL'))
const APP_BASE_URL = sanitizeEnvValue(Deno.env.get('APP_BASE_URL'))
const ALLOWED_ORIGIN = sanitizeEnvValue(Deno.env.get('ALLOWED_ORIGIN')) || '*'
const FYLL_WORDMARK_URL = APP_BASE_URL ? new URL('/fyll-wordmark-email.png', APP_BASE_URL).toString() : ''
const BUSINESS_ASSETS_PUBLIC_BASE = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/business-assets/`
  : ''

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type CaseEmailType = 'case_opened' | 'replacement_sent' | 'refund' | 'credit' | 'resolved'
const CASE_EMAIL_TYPES: CaseEmailType[] = ['case_opened', 'replacement_sent', 'refund', 'credit', 'resolved']

type Payload = {
  type?: CaseEmailType
  businessId?: string
  caseId?: string
  message?: string
  replacementOrderId?: string
  amount?: number
}

type DataRow = { id: string; business_id: string | null; name?: string | null; data: Record<string, unknown> | null }

const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: '₦', USD: '$', CAD: 'CA$', GBP: '£', EUR: '€', GHS: 'GH₵', KES: 'KSh ', ZAR: 'R', AUD: 'A$', PHP: '₱', INR: '₹', AED: 'AED ',
}

const jsonResponse = (status: number, body: Record<string, unknown>) => (
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
)

const getAdminClient = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
})
type Admin = ReturnType<typeof getAdminClient>

const toTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const getFirstName = (value: string) => toTrimmedString(value).split(/\s+/).filter(Boolean)[0] || 'there'
const normalizeBusinessName = (value: string) => value.trim() || 'Fyll'
const compactBusinessId = (value: string | null | undefined) => (
  (value ?? '').trim().toLowerCase().replace(/^biz-/, '').replace(/-/g, '')
)
const escapeHtml = (value: string) => (
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
)
const renderMultiline = (value: string) => escapeHtml(value).replace(/\n/g, '<br />')
const normalizeSlug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '')

const normalizeEmailImageUrl = (value: unknown) => {
  const trimmed = toTrimmedString(value)
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed)
      if (SUPABASE_URL && parsed.origin === new URL(SUPABASE_URL).origin) {
        for (const prefix of ['/storage/v1/object/sign/business-assets/', '/storage/v1/object/authenticated/business-assets/', '/storage/v1/object/public/business-assets/']) {
          if (parsed.pathname.startsWith(prefix)) return new URL(parsed.pathname.slice(prefix.length), BUSINESS_ASSETS_PUBLIC_BASE).toString()
        }
      }
    } catch {
      return trimmed
    }
    return trimmed
  }
  if (/^\/\//.test(trimmed)) return `https:${trimmed}`
  if (BUSINESS_ASSETS_PUBLIC_BASE && !trimmed.startsWith('data:image/')) {
    return new URL(trimmed.replace(/^\/+/, ''), BUSINESS_ASSETS_PUBLIC_BASE).toString()
  }
  return ''
}

const formatMoney = (amount: number, currency: string) => {
  const code = CURRENCY_SYMBOLS[currency] ? currency : 'NGN'
  const symbol = CURRENCY_SYMBOLS[code]
  const formatted = code === 'NGN'
    ? Math.round(amount).toLocaleString('en-US')
    : amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${symbol}${formatted}`
}

const formatDate = (iso: string) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

const buildTrackingUrl = (code: string, email: string, businessSlug: string) => {
  if (!APP_BASE_URL || !code) return ''
  const slug = normalizeSlug(businessSlug)
  const url = new URL(slug ? `/${slug}/order-tracking/${encodeURIComponent(code)}` : '/order-tracking', APP_BASE_URL)
  if (!slug) url.searchParams.set('code', code)
  if (email) url.searchParams.set('email', email)
  return url.toString()
}

// ---- Rendering ---------------------------------------------------------------------------------------------------

// The business is the sender, so the header carries only its logo and name (no shared Fyll artwork): each business's
// emails look like its own. The body follows the newer Fyll emails: bold reference card, lime button, next steps.

type Row = { label: string; value: string }
type Badge = 'check' | 'search' | 'refresh'

const LABEL_STYLE = 'font-size:12.5px;font-weight:600;letter-spacing:0.8px;text-transform:uppercase;color:#6b6c63;'

const renderRows = (rows: Row[]) => rows.filter((row) => row.value).map((row, index, list) => `
  <tr>
    <td valign="top" style="padding:14px 0;${index < list.length - 1 ? 'border-bottom:1px solid rgba(30,30,30,0.07);' : ''}font-size:14px;color:#6b6c63;width:38%;">${escapeHtml(row.label)}</td>
    <td valign="top" align="right" style="padding:14px 0;${index < list.length - 1 ? 'border-bottom:1px solid rgba(30,30,30,0.07);' : ''}font-size:15px;color:#1e1e1e;line-height:1.5;text-align:right;">${renderMultiline(row.value)}</td>
  </tr>`).join('')

const badgeGlyph = (badge: Badge) => {
  if (badge === 'search') return '&#9906;'
  if (badge === 'refresh') return '&#8635;'
  return '&#10003;'
}

const renderEmail = ({
  brandName,
  brandLogoUrl,
  eyebrow,
  heading,
  badge = 'check',
  intro,
  highlightLabel,
  highlightValue,
  highlightSide,
  rows,
  rowsLabel,
  messageLabel,
  message,
  ctaLabel,
  ctaUrl,
  steps,
  closing,
  footerNote,
}: {
  brandName: string
  brandLogoUrl: string
  eyebrow: string
  heading: string
  badge?: Badge
  intro: string
  highlightLabel: string
  highlightValue: string
  highlightSide?: string
  rows: Row[]
  rowsLabel?: string
  messageLabel?: string
  message?: string
  ctaLabel?: string
  ctaUrl?: string
  steps?: { text: string; done?: boolean }[]
  closing?: string
  footerNote: string
}) => {
  const safeBrand = escapeHtml(brandName)
  const initial = escapeHtml(brandName.charAt(0).toUpperCase() || 'F')
  const logo = brandLogoUrl
    ? `<img src="${escapeHtml(brandLogoUrl)}" alt="${safeBrand}" width="44" height="44" style="display:block;width:44px;height:44px;border-radius:50%;object-fit:cover;border:1px solid #e3e3de;" />`
    : `<span style="display:block;width:44px;height:44px;line-height:44px;border-radius:50%;background:#1e1e1e;color:#ffffff;font-size:19px;font-weight:600;text-align:center;">${initial}</span>`
  const displayUrl = ctaUrl ? escapeHtml(ctaUrl.replace(/^https?:\/\//i, '').replace(/\/$/, '')) : ''
  const visibleRows = rows.filter((row) => row.value)
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
    <link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&amp;family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&amp;display=swap" rel="stylesheet" />
    <style>
      :root { color-scheme: light only; supported-color-schemes: light only; }
      body, table, td, a { font-family:'DM Sans',-apple-system,'Segoe UI',system-ui,sans-serif; }
      a:hover { color:#3f4a08 !important; }
      @media only screen and (max-width:640px) {
        .email-wrap { padding:18px 12px 28px !important; }
        .email-card { border-radius:22px !important; }
        .head { padding:24px 22px 0 !important; }
        .content { padding:24px 22px 30px !important; }
        .title { font-size:28px !important; letter-spacing:-1px !important; }
        .ref-value { font-size:28px !important; letter-spacing:-1px !important; }
        .footer { padding:22px 22px 26px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:#ffffff;color:#1e1e1e;-webkit-font-smoothing:antialiased;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(intro)}</div>
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
                      <span style="display:inline-block;padding:7px 13px;border-radius:999px;background:#f6f6f1;border:1px solid rgba(30,30,30,0.06);color:#55564e;font-size:12.5px;font-weight:600;white-space:nowrap;"><span style="color:#97a91e;font-size:13px;line-height:0;">&#9679;</span>&nbsp;&nbsp;${escapeHtml(eyebrow)}</span>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:30px 0 0;border-collapse:collapse;">
                  <tr>
                    <td valign="middle" style="padding-right:14px;">
                      <span style="display:block;width:46px;height:46px;line-height:46px;border-radius:50%;background:#d5e057;color:#1e1e1e;font-size:22px;font-weight:600;text-align:center;box-shadow:0 0 0 7px rgba(213,224,87,0.22);">${badgeGlyph(badge)}</span>
                    </td>
                    <td class="title" valign="middle" style="font-family:'Bricolage Grotesque','Arial Black',sans-serif;font-weight:800;font-size:32px;letter-spacing:-1.2px;color:#1e1e1e;line-height:1.05;">${escapeHtml(heading)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td class="content" style="padding:26px 40px 36px;">
                <p style="margin:0 0 22px;font-size:16.5px;line-height:1.6;color:#3a3b35;">${renderMultiline(intro)}</p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;table-layout:fixed;margin:0 0 22px;background:#f6f6f1;border:1px solid rgba(30,30,30,0.06);border-radius:20px;border-collapse:separate;">
                  <tr>
                    <td width="62%" valign="middle" style="width:62%;padding:20px 8px 20px 22px;">
                      <div style="${LABEL_STYLE}margin-bottom:4px;">${escapeHtml(highlightLabel)}</div>
                      <div class="ref-value" style="font-family:'Bricolage Grotesque','Arial Black',sans-serif;font-weight:800;font-size:32px;letter-spacing:-1.2px;line-height:1.1;color:#1e1e1e;word-break:break-all;">${escapeHtml(highlightValue)}</div>
                    </td>
                    <td width="38%" align="right" valign="middle" style="width:38%;padding:20px 22px 20px 8px;font-size:14px;color:#6b6c63;line-height:1.5;text-align:right;">${highlightSide ? renderMultiline(highlightSide) : ''}</td>
                  </tr>
                </table>

                ${ctaUrl ? `
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 12px;border-collapse:separate;">
                  <tr>
                    <td align="center" bgcolor="#d5e057" style="height:58px;border-radius:999px;">
                      <a href="${escapeHtml(ctaUrl)}" style="display:block;padding:17px 20px;color:#1e1e1e !important;font-size:17px;font-weight:600;text-decoration:none;line-height:24px;">${escapeHtml(ctaLabel || 'Open')}&nbsp;&nbsp;&#8594;</a>
                    </td>
                  </tr>
                </table>
                <div style="margin:0 0 28px;text-align:center;font-size:13.5px;color:#6b6c63;line-height:1.45;">Or open <a href="${escapeHtml(ctaUrl)}" style="color:#5f6a00;font-weight:600;text-decoration:underline;word-break:break-all;">${displayUrl}</a></div>` : ''}

                ${visibleRows.length > 0 ? `
                ${rowsLabel ? `<div style="${LABEL_STYLE}margin-bottom:10px;">${escapeHtml(rowsLabel)}</div>` : ''}
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 22px;border:1px solid rgba(30,30,30,0.08);border-radius:20px;border-collapse:separate;">
                  <tr><td style="padding:4px 22px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">${renderRows(visibleRows)}</table></td></tr>
                </table>` : ''}

                ${message ? `
                <div style="${LABEL_STYLE}margin-bottom:10px;">${escapeHtml(messageLabel || 'A note from us')}</div>
                <div style="margin:0 0 22px;border:1px solid rgba(30,30,30,0.08);border-radius:20px;padding:18px 22px;font-size:15px;line-height:1.6;color:#3a3b35;">${renderMultiline(message)}</div>` : ''}

                ${steps && steps.length > 0 ? `
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0 0 ${closing ? '22px' : '0'};background:#f6f6f1;border-radius:20px;border-collapse:separate;">
                  <tr><td colspan="2" style="padding:22px 22px 14px;${LABEL_STYLE}">What happens next</td></tr>
                  ${steps.map((step, index) => `
                  <tr>
                    <td valign="top" style="padding:0 14px ${index === steps.length - 1 ? '22px' : '14px'} 22px;width:28px;"><span style="display:block;width:28px;height:28px;line-height:28px;border-radius:50%;background:${index === 0 ? '#d5e057' : 'rgba(30,30,30,0.07)'};color:${index === 0 ? '#1e1e1e' : '#55564e'};font-size:13px;font-weight:600;text-align:center;">${step.done ? '&#10003;' : index + 1}</span></td>
                    <td valign="top" style="padding:3px 22px ${index === steps.length - 1 ? '22px' : '14px'} 0;font-size:15px;line-height:1.5;color:#3a3b35;">${escapeHtml(step.text)}</td>
                  </tr>`).join('')}
                </table>` : ''}

                ${closing ? `<div style="background:#f6f6f1;border-radius:20px;padding:18px 22px;font-size:15px;line-height:1.6;color:#3a3b35;">${escapeHtml(closing)}</div>` : ''}
              </td>
            </tr>
            <tr>
              <td class="footer" style="padding:22px 40px 28px;border-top:1px solid rgba(30,30,30,0.07);">
                ${FYLL_WORDMARK_URL ? `
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 10px;border-collapse:collapse;">
                  <tr>
                    <td valign="middle" style="padding-right:8px;font-size:13px;color:#6b6c63;">Handled with</td>
                    <td valign="middle"><img src="${escapeHtml(FYLL_WORDMARK_URL)}" alt="Fyll" style="display:block;height:17px;max-width:78px;width:auto;border:0;filter:brightness(0.12);" /></td>
                  </tr>
                </table>` : ''}
                <div style="font-size:12.5px;line-height:1.55;color:#8c8d84;margin-bottom:10px;">${escapeHtml(footerNote)}</div>
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

// ---- Data --------------------------------------------------------------------------------------------------------

const getRow = async (admin: Admin, table: string, businessId: string, id: string) => {
  const { data, error } = await admin.from(table).select('id, business_id, data').eq('business_id', businessId).eq('id', id).maybeSingle()
  if (error) throw error
  return data as DataRow | null
}

const callerBelongsToBusiness = async (admin: Admin, req: Request, businessId: string) => {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return false
  const { data, error } = await admin.auth.getUser(token)
  const userId = data?.user?.id
  if (error || !userId) return false
  const target = compactBusinessId(businessId)
  const { data: profile } = await admin.from('profiles').select('business_id').eq('id', userId).maybeSingle()
  if (compactBusinessId(profile?.business_id as string | undefined) === target) return true
  const { data: memberships } = await admin.from('team_members').select('business_id').eq('user_id', userId)
  return (memberships ?? []).some((row: { business_id?: string | null }) => compactBusinessId(row.business_id) === target)
}

const sendEmail = async (args: { toEmail: string; subject: string; html: string; text: string; fromName: string }) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${args.fromName} <${RESEND_FROM_EMAIL}>`,
      to: [args.toEmail],
      subject: args.subject,
      html: args.html,
      text: args.text,
    }),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok) throw new Error(`Resend failed: ${JSON.stringify(payload)}`)
}

const itemLines = (order: Record<string, unknown>) => {
  const items = Array.isArray(order.items) ? order.items as Record<string, unknown>[] : []
  return items.map((item) => {
    const name = toTrimmedString(item.productName) || 'Item'
    const variant = toTrimmedString(item.variantName)
    const qty = typeof item.quantity === 'number' ? item.quantity : 1
    return `${qty} × ${name}${variant ? ` (${variant})` : ''}`
  }).join('\n')
}

// ---- Handler -----------------------------------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' })
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return jsonResponse(500, { error: 'Email service is not configured.' })
  }

  try {
    const payload = await req.json().catch(() => null) as Payload | null
    const type = payload?.type
    const businessId = toTrimmedString(payload?.businessId)
    const caseId = toTrimmedString(payload?.caseId)
    if (!type || !CASE_EMAIL_TYPES.includes(type) || !businessId || !caseId) {
      return jsonResponse(400, { error: 'Missing type, businessId or caseId.' })
    }

    const admin = getAdminClient()
    if (!(await callerBelongsToBusiness(admin, req, businessId))) {
      return jsonResponse(403, { error: 'Not allowed for this business.' })
    }

    const caseRow = await getRow(admin, 'cases', businessId, caseId)
    const caseItem = caseRow?.data
    if (!caseItem) return jsonResponse(404, { error: 'Case not found.' })

    const orderId = toTrimmedString(caseItem.orderId)
    const originalOrder = orderId ? (await getRow(admin, 'orders', businessId, orderId))?.data ?? null : null

    // Customer email: from the linked order, else the customer record.
    let customerEmail = toTrimmedString(originalOrder?.customerEmail).toLowerCase()
    let customerName = toTrimmedString(originalOrder?.customerName) || toTrimmedString(caseItem.customerName)
    const customerId = toTrimmedString(caseItem.customerId)
    if (!customerEmail && customerId) {
      const customer = (await getRow(admin, 'customers', businessId, customerId))?.data
      customerEmail = toTrimmedString(customer?.email).toLowerCase()
      customerName = customerName || toTrimmedString(customer?.fullName)
    }
    if (!customerEmail || !customerEmail.includes('@')) {
      return jsonResponse(200, { sent: false, reason: 'missing-customer-email' })
    }

    const { data: businessRow, error: businessError } = await admin.from('businesses').select('id, name, data').eq('id', businessId).maybeSingle()
    if (businessError) throw businessError
    const businessData = (businessRow?.data ?? {}) as Record<string, unknown>
    const brandName = normalizeBusinessName(toTrimmedString(businessData.businessName) || toTrimmedString(businessRow?.name))
    const brandLogoUrl = normalizeEmailImageUrl(businessData.businessLogo)
    const businessSlug = toTrimmedString(businessData.businessSlug) || brandName
    const currency = toTrimmedString(businessData.currency).toUpperCase() || 'NGN'
    const contactPhone = toTrimmedString(businessData.businessPhone)
    const replyLine = contactPhone
      ? `If you have any questions, reply to this email or contact ${brandName} on ${contactPhone}.`
      : `If you have any questions, just reply to this email.`

    const caseNumber = toTrimmedString(caseItem.caseNumber) || caseId
    const orderNumber = toTrimmedString(originalOrder?.websiteOrderReference) || toTrimmedString(originalOrder?.orderNumber) || toTrimmedString(caseItem.orderNumber)
    const firstName = getFirstName(customerName)
    const message = toTrimmedString(payload?.message)

    let subject = ''
    let html = ''
    let textLines: string[] = []

    const footerNote = `You're getting this because ${brandName} opened a case about your order${orderNumber ? ` ${orderNumber}` : ''}. Reply to this email to reach ${brandName}.`
    const contactStep = contactPhone ? `Questions before then? Reply to this email or call ${contactPhone}.` : 'Questions before then? Just reply to this email.'

    if (type === 'case_opened') {
      const summary = message || toTrimmedString(caseItem.issueSummary)
      const intro = `Hi ${firstName},\nThanks for letting us know. ${brandName} has opened a case to look into your order, and we'll update you within 1–2 business days.`
      subject = `We're looking into your order${orderNumber ? ` ${orderNumber}` : ''} - ${caseNumber}`
      html = renderEmail({
        brandName, brandLogoUrl,
        eyebrow: 'Case opened',
        heading: "We're on it",
        badge: 'search',
        intro,
        highlightLabel: 'Case reference',
        highlightValue: caseNumber,
        highlightSide: orderNumber ? `About order\n${orderNumber}` : undefined,
        rows: [],
        messageLabel: 'What you told us',
        message: summary,
        steps: [
          { text: 'Our team reviews what happened.' },
          { text: "We email you how we'll put it right." },
          { text: contactStep },
        ],
        footerNote,
      })
      textLines = [intro, '', `Case reference: ${caseNumber}`, orderNumber ? `Order: ${orderNumber}` : '', summary ? `What you told us: ${summary}` : '', '', contactStep]
    } else if (type === 'replacement_sent') {
      const replacementOrderId = toTrimmedString(payload?.replacementOrderId)
      const replacement = replacementOrderId ? (await getRow(admin, 'orders', businessId, replacementOrderId))?.data ?? null : null
      if (!replacement) return jsonResponse(404, { error: 'Replacement order not found.' })
      const replacementNumber = toTrimmedString(replacement.orderNumber)
      const code = toTrimmedString(replacement.customerTrackingCode) || replacementNumber
      const trackingUrl = buildTrackingUrl(code, customerEmail, businessSlug)
      const eta = formatDate(toTrimmedString(replacement.fulfillmentEffectiveEta) || toTrimmedString(replacement.fulfillmentOriginalEta))
      const isPickup = toTrimmedString(replacement.fulfillmentMethod) === 'pickup' || toTrimmedString(replacement.fulfillmentType) === 'pickup'
      const intro = `Hi ${firstName},\nWe're sorry your order wasn't right. ${brandName} is sending you a replacement at no extra cost.`
      const items = itemLines(replacement)
      subject = `Your replacement is on its way${orderNumber ? ` - order ${orderNumber}` : ''}`
      html = renderEmail({
        brandName, brandLogoUrl,
        eyebrow: caseNumber,
        heading: isPickup ? 'Replacement on the way' : 'Replacement on its way',
        badge: 'refresh',
        intro,
        highlightLabel: 'Replacement order',
        highlightValue: replacementNumber,
        highlightSide: eta ? `${isPickup ? 'Ready by' : 'Arrives by'}\n${eta}` : undefined,
        ctaLabel: 'Track your replacement',
        ctaUrl: trackingUrl,
        rowsLabel: "What we're sending",
        rows: [
          { label: 'Items', value: items },
          { label: 'Cost to you', value: formatMoney(0, currency) },
        ],
        messageLabel: 'A note from us',
        message,
        footerNote: `Replacing ${orderNumber ? `order ${orderNumber}` : 'your order'} for case ${caseNumber}. Questions? Reply to this email${contactPhone ? ` or call ${brandName} on ${contactPhone}` : ''}.`,
      })
      textLines = [intro, '', `Replacement order: ${replacementNumber}`, orderNumber ? `Replacing: ${orderNumber}` : '', `Items:\n${items}`, eta ? `Estimated delivery: ${eta}` : '', message, trackingUrl ? `Track it: ${trackingUrl}` : '', '', replyLine]
    } else if (type === 'refund' || type === 'credit') {
      const amount = typeof payload?.amount === 'number' && Number.isFinite(payload.amount) ? payload.amount : 0
      const isRefund = type === 'refund'
      const amountLabel = amount > 0 ? formatMoney(amount, currency) : ''
      const intro = isRefund
        ? `Hi ${firstName},\n${brandName} has approved a refund for your order. Here's what to expect.`
        : `Hi ${firstName},\n${brandName} has added a store credit for you. You can use it on your next order.`
      subject = isRefund ? `Your refund has been approved - ${caseNumber}` : `A credit has been added for you - ${caseNumber}`
      html = renderEmail({
        brandName, brandLogoUrl,
        eyebrow: caseNumber,
        heading: isRefund ? 'Refund approved' : 'Credit added',
        badge: 'check',
        intro,
        highlightLabel: isRefund ? 'Refund amount' : 'Credit amount',
        highlightValue: amountLabel || caseNumber,
        highlightSide: orderNumber ? `For order\n${orderNumber}` : undefined,
        rows: [],
        messageLabel: 'A note from us',
        message,
        steps: isRefund
          ? [
            { text: `Refund approved by ${brandName}.`, done: true },
            { text: 'The money is sent back the way you paid.' },
            { text: 'It usually reaches you within 3–5 business days, depending on your bank.' },
          ]
          : undefined,
        closing: isRefund ? undefined : replyLine,
        footerNote: `About case ${caseNumber}. Questions? Reply to this email${contactPhone ? ` or call ${brandName} on ${contactPhone}` : ''}.`,
      })
      textLines = [intro, '', amountLabel ? `${isRefund ? 'Refund' : 'Credit'}: ${amountLabel}` : '', `Case: ${caseNumber}`, orderNumber ? `Order: ${orderNumber}` : '', message, '', replyLine]
    } else {
      const intro = `Hi ${firstName},\n${brandName} has resolved the case about your order. Thanks for your patience.`
      const stillLine = `Still not right? Reply to this email and we'll pick it back up${contactPhone ? `, or call ${brandName} on ${contactPhone}` : ''}.`
      subject = `Your case has been resolved - ${caseNumber}`
      html = renderEmail({
        brandName, brandLogoUrl,
        eyebrow: caseNumber,
        heading: 'Case resolved',
        badge: 'check',
        intro,
        highlightLabel: 'Case reference',
        highlightValue: caseNumber,
        highlightSide: orderNumber ? `About order\n${orderNumber}` : undefined,
        rows: [],
        messageLabel: 'How we resolved it',
        message,
        closing: stillLine,
        footerNote,
      })
      textLines = [intro, '', `Case reference: ${caseNumber}`, message ? `How we resolved it: ${message}` : '', '', stillLine]
    }

    await sendEmail({
      toEmail: customerEmail,
      fromName: `${brandName} - Fyll`,
      subject,
      html,
      text: textLines.filter((line) => line !== '').join('\n') || subject,
    })

    return jsonResponse(200, { sent: true, to: customerEmail })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Case email failed:', message)
    return jsonResponse(500, { error: message })
  }
})
