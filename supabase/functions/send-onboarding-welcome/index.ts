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
// Light Fyll wordmark for the dark email header. PNG (many email apps block SVG), hosted in the
// public business-assets bucket so it works without a web deploy.
const FYLL_WORDMARK_LIGHT_URL = SUPABASE_URL
  ? `${SUPABASE_URL.replace(/\/+$/, '')}/storage/v1/object/public/business-assets/fyll/fyll-wordmark-email-light.png`
  : ''

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type WelcomePayload = {
  type?: 'founder_welcome' | 'team_welcome'
  businessId?: string
  toEmail?: string
  recipientName?: string
  role?: string | null
  inviterName?: string | null
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

const toTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const getFirstName = (value: string) => toTrimmedString(value).split(/\s+/).filter(Boolean)[0] || 'there'
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

const normalizeBusinessName = (value: string) => value.trim() || 'Fyll'

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"

const getDashboardUrl = () => (APP_BASE_URL ? new URL('/(tabs)', APP_BASE_URL).toString() : '')

// The shared Fyll email shell: charcoal header with the wordmark, white body, lime button.
const renderEmailShell = ({
  preheader,
  greeting,
  headline,
  intro,
  bodyHtml,
  buttonLabel,
  reason,
  signOff = true,
}: {
  preheader: string
  greeting: string
  headline: string
  intro: string
  bodyHtml: string
  buttonLabel: string
  reason: string
  signOff?: boolean
}) => {
  const dashboardUrl = getDashboardUrl()
  const logo = FYLL_WORDMARK_LIGHT_URL
    ? `<img src="${FYLL_WORDMARK_LIGHT_URL}" height="30" alt="Fyll" style="display:block;height:30px;width:auto;border:0;outline:none;text-decoration:none;">
       <div style="height:34px;line-height:34px;font-size:0;">&nbsp;</div>`
    : ''
  const button = dashboardUrl
    ? `<tr><td align="center" style="background:#ffffff;padding:26px 28px 0;">
         <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#d5e057" style="border-radius:999px;"><a href="${dashboardUrl}" style="display:inline-block;padding:16px 34px;font-family:${FONT};font-size:16px;font-weight:700;color:#141414;text-decoration:none;border-radius:999px;">${escapeHtml(buttonLabel)}</a></td></tr></table>
       </td></tr>`
    : ''
  const closing = signOff
    ? `<div style="font-size:14.5px;line-height:22px;color:#5f6058;">Reply to this email any time. A real person reads it.</div>
       <div style="height:10px;line-height:10px;font-size:0;">&nbsp;</div>
       <div style="font-size:14.5px;font-weight:600;color:#141414;">The Fyll team</div>`
    : ''

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fyll</title></head>
<body style="margin:0;padding:0;background:#e9e9e3;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e9e9e3;">
<tr><td align="center" style="padding:28px 12px 40px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
<tr><td bgcolor="#141414" style="background:#141414;border-radius:24px 24px 0 0;padding:28px 28px 32px;">
  ${logo}
  <div style="font-family:${FONT};font-size:16px;line-height:22px;color:#b9bab0;">${escapeHtml(greeting)}</div>
  <div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>
  <div style="font-family:${FONT};font-size:32px;line-height:37px;font-weight:700;letter-spacing:-0.8px;color:#f4f4ef;">${escapeHtml(headline)}</div>
  <div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>
  <div style="font-family:${FONT};font-size:15.5px;line-height:23px;color:#b9bab0;">${intro}</div>
</td></tr>
${bodyHtml}
${button}
<tr><td style="background:#ffffff;padding:24px 28px 30px;border-radius:0 0 24px 24px;font-family:${FONT};">
  ${closing}
</td></tr>
<tr><td align="center" style="padding:26px 20px 0;font-family:${FONT};">
  <div style="font-size:12px;line-height:18px;color:#8c8d84;">${escapeHtml(reason)}</div>
</td></tr>
</table></td></tr></table>
</body>
</html>`
}

const renderStep = (index: number, title: string, text: string, isLast: boolean) => `
<tr><td style="padding:${index === 1 ? '0' : '14px'} 0 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="40" valign="top"><div style="width:28px;height:28px;border-radius:14px;background:#141414;color:#f4f4ef;font-family:${FONT};font-size:13px;font-weight:700;line-height:28px;text-align:center;">${index}</div></td>
    <td valign="top" style="font-family:${FONT};padding-bottom:14px;border-bottom:${isLast ? '0' : '1px solid #ecece6'};">
      <div style="font-size:16px;font-weight:600;color:#141414;line-height:22px;">${escapeHtml(title)}</div>
      <div style="font-size:14px;line-height:21px;color:#5f6058;padding-top:3px;">${escapeHtml(text)}</div>
    </td>
  </tr></table>
</td></tr>`

const renderMoreRow = (title: string, text: string, isFirst: boolean) => `
<tr><td style="padding:11px 0;border-top:${isFirst ? '0' : '1px solid #ecece6'};font-family:${FONT};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="22" valign="top" style="padding-top:7px;"><div style="width:8px;height:8px;border-radius:4px;background:#b9c46a;font-size:0;line-height:0;">&nbsp;</div></td>
    <td style="font-size:14.5px;line-height:21px;color:#5f6058;"><b style="color:#141414;font-weight:600;">${escapeHtml(title)}</b> ${escapeHtml(text)}</td>
  </tr></table>
</td></tr>`

const buildFounderWelcomeEmail = ({
  recipientName,
  businessName,
  toEmail,
}: {
  recipientName: string
  businessName: string
  toEmail: string
}) => {
  const firstName = getFirstName(recipientName)
  const steps: Array<[string, string]> = [
    ['Add your products', 'Import a spreadsheet or add them one by one, with prices and stock.'],
    ['Take your first order', 'Tap New order, or paste a customer’s WhatsApp message and let Fyll AI fill it in.'],
    ['Invite your team', 'Give each person a role: admin, manager or staff.'],
  ]
  const more: Array<[string, string]> = [
    ['Get paid.', 'Send a payment link, and verified payments show up next to the order.'],
    ['Keep customers in the loop.', 'They get a tracking page and status emails.'],
    ['Check quality before dispatch.', 'A checklist and proof photos for every order.'],
    ['Work with partners.', 'Track jobs and bills with your lens lab or any other supplier.'],
    ['Stay ahead of stock.', 'Low-stock alerts and monthly audits.'],
    ['See what’s working.', 'Revenue, best sellers and sales by source.'],
    ['Sell online.', 'Create your Fyll Storefront or connect your website.'],
  ]

  const bodyHtml = `
<tr><td style="background:#ffffff;padding:28px 28px 0;font-family:${FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="font-size:20px;font-weight:700;letter-spacing:-0.3px;color:#141414;padding-bottom:16px;">Start here</td>
    <td align="right" style="padding-bottom:16px;"><span style="display:inline-block;padding:5px 11px;border-radius:999px;background:#f4f4ef;font-size:12.5px;font-weight:600;color:#5f6058;">About 15 minutes</span></td>
  </tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${steps.map(([title, text], i) => renderStep(i + 1, title, text, i === steps.length - 1)).join('')}
  </table>
</td></tr>
<tr><td style="background:#ffffff;padding:30px 28px 0;font-family:${FONT};">
  <div style="font-size:20px;font-weight:700;letter-spacing:-0.3px;color:#141414;padding-bottom:6px;">When you’re ready for more</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${more.map(([title, text], i) => renderMoreRow(title, text, i === 0)).join('')}
  </table>
</td></tr>
<tr><td style="background:#ffffff;padding:20px 28px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#141414" style="background:#141414;border-radius:18px;"><tr><td style="padding:18px 20px;font-family:${FONT};">
    <div style="font-size:11.5px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#d5e057;">Every morning</div>
    <div style="font-size:15px;line-height:22px;color:#f4f4ef;padding-top:6px;">Your home screen shows <b style="font-weight:700;">Needs you today</b>: late orders, payments with no order, and stock about to run out, so you know what to handle first.</div>
  </td></tr></table>
</td></tr>`

  const subject = `${businessName} is set up on Fyll`
  const html = renderEmailShell({
    preheader: 'Start here: about 15 minutes to your first order.',
    greeting: `Hi ${firstName},`,
    headline: `${businessName} is set up on Fyll.`,
    intro: 'Fyll Ops is where your orders, stock, payments and team live together, so nothing gets lost between WhatsApp, spreadsheets and your memory.',
    bodyHtml,
    buttonLabel: 'Open Fyll',
    reason: `You’re getting this because you created a Fyll account with ${toEmail}.`,
  })
  const dashboardUrl = getDashboardUrl()
  const text = [
    `Hi ${firstName},`,
    '',
    `${businessName} is set up on Fyll.`,
    'Fyll Ops is where your orders, stock, payments and team live together, so nothing gets lost between WhatsApp, spreadsheets and your memory.',
    '',
    'START HERE (about 15 minutes)',
    ...steps.map(([title, body], i) => `${i + 1}. ${title}: ${body}`),
    '',
    'WHEN YOU’RE READY FOR MORE',
    ...more.map(([title, body]) => `- ${title} ${body}`),
    '',
    'EVERY MORNING',
    'Your home screen shows Needs you today: late orders, payments with no order, and stock about to run out, so you know what to handle first.',
    '',
    dashboardUrl ? `Open Fyll: ${dashboardUrl}` : '',
    '',
    'Reply to this email any time. A real person reads it.',
    'The Fyll team',
  ].filter((line, i, all) => line !== '' || all[i - 1] !== '').join('\n')

  return { subject, html, text }
}

const ROLE_ACCESS: Record<string, string> = {
  admin: 'You have full access: orders, stock, payments, finance and your team.',
  manager: 'You can manage orders and stock, restock items, scan items and run stock checks.',
  staff: 'You can process orders, scan items and run stock checks.',
}

const buildTeamWelcomeEmail = ({
  recipientName,
  businessName,
  role,
  inviterName,
  toEmail,
}: {
  recipientName: string
  businessName: string
  role: string
  inviterName: string
  toEmail: string
}) => {
  const firstName = getFirstName(recipientName)
  const roleKey = toTrimmedString(role).toLowerCase()
  const roleLabel = roleKey ? `${roleKey.charAt(0).toUpperCase()}${roleKey.slice(1)}` : 'Team member'
  const inviterLabel = toTrimmedString(inviterName) || 'A team admin'
  const access = ROLE_ACCESS[roleKey] ?? 'Open Fyll to see your orders and start working with the team.'

  const bodyHtml = `
<tr><td style="background:#ffffff;padding:28px 28px 0;font-family:${FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f4f4ef" style="background:#f4f4ef;border-radius:18px;"><tr><td style="padding:18px 20px;">
    <div style="font-size:11.5px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#5f6058;">Your role</div>
    <div style="font-size:20px;font-weight:700;letter-spacing:-0.3px;color:#141414;padding-top:4px;">${escapeHtml(roleLabel)}</div>
    <div style="font-size:14.5px;line-height:21px;color:#5f6058;padding-top:6px;">${escapeHtml(access)}</div>
  </td></tr></table>
</td></tr>
<tr><td style="background:#ffffff;padding:20px 28px 0;font-family:${FONT};">
  <div style="font-size:14.5px;line-height:22px;color:#5f6058;">Your home screen opens on <b style="color:#141414;font-weight:600;">Needs you today</b>, so you can see what to handle first. Start with <b style="color:#141414;font-weight:600;">Orders</b>.</div>
</td></tr>`

  const subject = `Welcome to ${businessName} on Fyll`
  const html = renderEmailShell({
    preheader: `${inviterLabel} added you to ${businessName} as ${roleLabel}.`,
    greeting: `Hi ${firstName},`,
    headline: `You’ve joined ${businessName}.`,
    intro: `${escapeHtml(inviterLabel)} added you to the ${escapeHtml(businessName)} workspace on Fyll as <b style="color:#f4f4ef;font-weight:600;">${escapeHtml(roleLabel)}</b>.`,
    bodyHtml,
    buttonLabel: 'Open Fyll',
    reason: `You’re getting this because ${toEmail} was added to ${businessName} on Fyll.`,
    signOff: false,
  })
  const dashboardUrl = getDashboardUrl()
  const text = [
    `Hi ${firstName},`,
    '',
    `${inviterLabel} added you to ${businessName} on Fyll as ${roleLabel}.`,
    access,
    'Your home screen opens on "Needs you today". Start with Orders.',
    dashboardUrl ? `Open Fyll: ${dashboardUrl}` : '',
  ].filter(Boolean).join('\n')

  return { subject, html, text }
}

const sendEmail = async ({
  toEmail,
  subject,
  html,
  text,
}: {
  toEmail: string
  subject: string
  html: string
  text: string
}) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
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

  return payload
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return jsonResponse(500, { error: 'Missing required function secrets.' })
  }

  try {
    const token = getBearerToken(req)
    if (!token) {
      return jsonResponse(401, { error: 'Unauthorized request.' })
    }

    const admin = getAdminClient()
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData.user) {
      return jsonResponse(401, { error: 'Unauthorized request.' })
    }

    const payload = (await req.json().catch(() => ({}))) as WelcomePayload
    const type = payload.type ?? 'team_welcome'
    const businessId = toTrimmedString(payload.businessId)
    const toEmail = toTrimmedString(payload.toEmail).toLowerCase()
    const recipientName = toTrimmedString(payload.recipientName)
    const role = toTrimmedString(payload.role)
    const inviterName = toTrimmedString(payload.inviterName)

    if (!businessId || !toEmail || !recipientName) {
      return jsonResponse(400, { error: 'Missing business, email, or recipient name.' })
    }

    const aliases = getBusinessIdAliases(businessId)
    const { data: businessRows, error: businessError } = await admin
      .from('businesses')
      .select('id,name,data')
      .in('id', aliases)

    if (businessError) throw businessError

    const normalizedBusinessId = compactBusinessId(businessId)
    const matchingBusiness = (
      (businessRows ?? []) as Array<{ id: string; name?: string | null; data?: Record<string, unknown> | null }>
    ).find((row) => compactBusinessId(row.id) === normalizedBusinessId) ?? null
    const businessData = (matchingBusiness?.data ?? {}) as Record<string, unknown>
    const businessName = normalizeBusinessName(
      toTrimmedString(businessData.businessName) || toTrimmedString(matchingBusiness?.name),
    )

    const emailContent = type === 'founder_welcome'
      ? buildFounderWelcomeEmail({ recipientName, businessName, toEmail })
      : buildTeamWelcomeEmail({
          recipientName,
          businessName,
          role,
          inviterName,
          toEmail,
        })

    const delivery = await sendEmail({
      toEmail,
      ...emailContent,
    })

    return jsonResponse(200, {
      success: true,
      type,
      businessName,
      delivery,
    })
  } catch (error) {
    console.error('send-onboarding-welcome error:', error)
    return jsonResponse(500, {
      error: error instanceof Error ? error.message : 'Unknown error',
    })
  }
})
