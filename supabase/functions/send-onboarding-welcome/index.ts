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

const buildFounderWelcomeEmail = ({
  recipientName,
  businessName,
}: {
  recipientName: string
  businessName: string
}) => {
  const firstName = getFirstName(recipientName)
  const dashboardUrl = APP_BASE_URL ? new URL('/(tabs)', APP_BASE_URL).toString() : ''
  const subject = `Welcome to FYLL, ${firstName}`
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; background:#f7f7f5; color:#111111; padding:24px;">
      <div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:18px; padding:28px;">
        <p style="margin:0 0 8px; color:#6b7280; font-size:12px; font-weight:700; letter-spacing:0.08em;">WELCOME TO FYLL</p>
        <h1 style="margin:0 0 12px; font-size:28px; line-height:1.2;">${businessName} is ready</h1>
        <p style="margin:0 0 14px; color:#374151; line-height:1.6;">
          Hi ${firstName}, your FYLL workspace has been created successfully. You can now start setting up your business, inviting your team, and managing orders in one place.
        </p>
        <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:14px; padding:16px; margin:0 0 18px;">
          <p style="margin:0; color:#111111; font-weight:600;">Workspace: ${businessName}</p>
          <p style="margin:8px 0 0; color:#6b7280; font-size:14px; line-height:1.5;">Start by checking your settings, branding, order statuses, and team access.</p>
        </div>
        ${dashboardUrl ? `<p style="margin:0 0 16px;"><a href="${dashboardUrl}" style="display:inline-block; background:#111111; color:#ffffff; text-decoration:none; padding:12px 18px; border-radius:999px; font-weight:700;">Open FYLL</a></p>` : ''}
        <p style="margin:0; color:#6b7280; font-size:12px; line-height:1.5;">You’re receiving this because you joined FYLL using an invite code.</p>
      </div>
    </div>
  `
  const text = [
    `Welcome to FYLL, ${firstName}`,
    '',
    `${businessName} is ready.`,
    'Your FYLL workspace has been created successfully.',
    'You can now set up your business, invite your team, and start managing operations in one place.',
    dashboardUrl ? `Open FYLL: ${dashboardUrl}` : '',
  ].filter(Boolean).join('\n')

  return { subject, html, text }
}

const buildTeamWelcomeEmail = ({
  recipientName,
  businessName,
  role,
  inviterName,
}: {
  recipientName: string
  businessName: string
  role: string
  inviterName: string
}) => {
  const firstName = getFirstName(recipientName)
  const dashboardUrl = APP_BASE_URL ? new URL('/(tabs)', APP_BASE_URL).toString() : ''
  const roleLabel = toTrimmedString(role)
    ? `${toTrimmedString(role).charAt(0).toUpperCase()}${toTrimmedString(role).slice(1).toLowerCase()}`
    : 'Team member'
  const inviterLabel = toTrimmedString(inviterName) || 'A team admin'
  const subject = `Welcome to ${businessName} on FYLL`
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; background:#f7f7f5; color:#111111; padding:24px;">
      <div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #e5e7eb; border-radius:18px; padding:28px;">
        <p style="margin:0 0 8px; color:#6b7280; font-size:12px; font-weight:700; letter-spacing:0.08em;">WELCOME TO FYLL</p>
        <h1 style="margin:0 0 12px; font-size:28px; line-height:1.2;">You’ve joined ${businessName}</h1>
        <p style="margin:0 0 14px; color:#374151; line-height:1.6;">
          Hi ${firstName}, ${inviterLabel} has added you to the FYLL workspace for <strong>${businessName}</strong> as <strong>${roleLabel}</strong>.
        </p>
        <div style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:14px; padding:16px; margin:0 0 18px;">
          <p style="margin:0; color:#111111; font-weight:600;">Role: ${roleLabel}</p>
          <p style="margin:8px 0 0; color:#6b7280; font-size:14px; line-height:1.5;">Open FYLL to start collaborating with the team.</p>
        </div>
        ${dashboardUrl ? `<p style="margin:0 0 16px;"><a href="${dashboardUrl}" style="display:inline-block; background:#111111; color:#ffffff; text-decoration:none; padding:12px 18px; border-radius:999px; font-weight:700;">Open FYLL</a></p>` : ''}
        <p style="margin:0; color:#6b7280; font-size:12px; line-height:1.5;">You’re receiving this because you accepted a FYLL invite code.</p>
      </div>
    </div>
  `
  const text = [
    `Welcome to ${businessName} on FYLL`,
    '',
    `Hi ${firstName}, ${inviterLabel} added you as ${roleLabel}.`,
    `You’ve joined the FYLL workspace for ${businessName}.`,
    dashboardUrl ? `Open FYLL: ${dashboardUrl}` : '',
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
      ? buildFounderWelcomeEmail({ recipientName, businessName })
      : buildTeamWelcomeEmail({
          recipientName,
          businessName,
          role,
          inviterName,
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
