import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Primary Fyll accounts: create a primary email, link it to a business, or claim
// another business with it. See supabase/primary_accounts.sql for the data model.
//
// Actions (POST JSON { action, ... }, Authorization: Bearer <user JWT>):
//   link   – a business ADMIN adds the owner's primary email to their business.
//            Creates the primary account and emails it a 6-digit code. While the
//            email is still unverified it can be replaced; once verified it is
//            locked. If that primary email already exists, the caller proves
//            ownership with its password instead.
//   promote – a business ADMIN makes the email they are already signed in with their
//            primary email. No code: signing in with it already proves they own it.
//            Only ever the caller's own login email, never someone else's.
//   verify – the admin enters the emailed code; a correct code confirms the email
//            and activates the link.
//   resend – the admin asks for a fresh code for a pending link.
//   claim  – a signed-in PRIMARY account claims another business by proving it
//            can sign in as that business's admin (work email + password).
//
// The code is our own (sent through Resend), so this works whatever the project's
// Supabase email templates look like.

const sanitizeEnvValue = (value: string | undefined | null) => (
  (value ?? '')
    .normalize('NFKC')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
)

const SUPABASE_URL = sanitizeEnvValue(Deno.env.get('SUPABASE_URL'))
const SUPABASE_ANON_KEY = sanitizeEnvValue(Deno.env.get('SUPABASE_ANON_KEY'))
const SUPABASE_SERVICE_ROLE_KEY = sanitizeEnvValue(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
const RESEND_API_KEY = sanitizeEnvValue(Deno.env.get('RESEND_API_KEY'))
const RESEND_FROM_EMAIL = sanitizeEnvValue(Deno.env.get('RESEND_FROM_EMAIL'))
const APP_BASE_URL = sanitizeEnvValue(Deno.env.get('APP_BASE_URL'))
// The same hosted wordmark the other Fyll emails use (public/fyll-wordmark-email.png).
const FYLL_WORDMARK_URL = APP_BASE_URL ? new URL('/fyll-wordmark-email.png', APP_BASE_URL).toString() : ''
const ALLOWED_ORIGIN = sanitizeEnvValue(Deno.env.get('ALLOWED_ORIGIN')) || '*'

const CODE_TTL_MINUTES = 15
const MAX_CODE_ATTEMPTS = 5
const RESEND_COOLDOWN_SECONDS = 30

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonResponse = (status: number, body: Record<string, unknown>) => (
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
)

class HttpError extends Error {
  status: number
  code: string
  constructor(status: number, code: string, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

const admin = () => createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// A throwaway client used only to check a password or send a verification email.
const anon = () => createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const normalizeEmail = (value: unknown) => String(value ?? '').trim().toLowerCase()

const getCaller = async (request: Request) => {
  const token = (request.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) throw new HttpError(401, 'not_signed_in', 'Please sign in first.')
  const { data, error } = await admin().auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'not_signed_in', 'Please sign in again.')
  return data.user
}

// The business a work login administers, or an error if it is not an admin.
const getAdminBusinessId = async (userId: string) => {
  const db = admin()
  const { data: profile } = await db.from('profiles').select('business_id, role').eq('id', userId).maybeSingle()
  const businessId = profile?.business_id as string | undefined
  if (!businessId) throw new HttpError(403, 'no_business', 'This login is not attached to a business.')

  let isAdmin = profile?.role === 'admin'
  if (!isAdmin) {
    const { data: member } = await db
      .from('team_members')
      .select('role')
      .eq('user_id', userId)
      .eq('business_id', businessId)
      .maybeSingle()
    isAdmin = member?.role === 'admin'
  }
  if (!isAdmin) throw new HttpError(403, 'not_admin', 'Only a business admin can do this.')
  return businessId
}

const isPrimaryAccount = async (userId: string) => {
  const { data } = await admin().from('fyll_accounts').select('id').eq('id', userId).maybeSingle()
  return Boolean(data)
}

const assertReady = async () => {
  const { data, error } = await admin().rpc('primary_accounts_ready')
  if (error || data !== true) {
    throw new HttpError(503, 'not_ready', 'Primary accounts are not set up on the server yet.')
  }
}

const toHex = (bytes: ArrayBuffer) => Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, '0')).join('')

// HMAC keyed with the service role key (never exposed), so a leaked row can't be brute-forced offline.
const hashCode = async (accountId: string, code: string) => {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SUPABASE_SERVICE_ROLE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${accountId}:${code}`)))
}

const safeEqual = (a: string, b: string) => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

const generateCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, '0')

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const buildCodeEmail = (code: string, businessName: string) => {
  const safeBusiness = escapeHtml(businessName)
  const spacedCode = `${code.slice(0, 3)}&nbsp;${code.slice(3)}`
  const subject = `${code} is your Fyll verification code`
  const html = `
    <!doctype html>
    <html>
      <body style="margin:0;padding:0;background-color:#f4f4ef;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4ef;padding:32px 16px;">
          <tr>
            <td align="center">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background-color:#ffffff;border-radius:24px;border:1px solid #e7e7e1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
                <tr>
                  <td style="padding:32px 32px 0 32px;">
                    ${FYLL_WORDMARK_URL
                      ? `<img src="${FYLL_WORDMARK_URL}" alt="Fyll" height="28" style="height:28px;width:auto;max-width:120px;display:block;border:0;outline:none;text-decoration:none;" />`
                      : ''}
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 32px 0 32px;">
                    <p style="margin:0 0 10px 0;color:#8a8b80;font-size:12px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;">Primary email</p>
                    <h1 style="margin:0 0 12px 0;color:#141414;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.3px;">Confirm your primary email</h1>
                    <p style="margin:0;color:#4a4b44;font-size:15px;line-height:1.6;">
                      Enter this code in Fyll to make this your primary email${safeBusiness ? ` for <strong style="color:#141414;">${safeBusiness}</strong>` : ''}.
                    </p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:24px 32px 0 32px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#141414;border-radius:18px;">
                      <tr>
                        <td align="center" style="padding:26px 12px;">
                          <p style="margin:0 0 8px 0;color:#9d9e94;font-size:12px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;">Your code</p>
                          <p style="margin:0;color:#d5e057;font-size:42px;line-height:1;font-weight:800;letter-spacing:0.16em;font-family:'SF Mono',Menlo,Consolas,'Courier New',monospace;">${spacedCode}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:22px 32px 0 32px;">
                    <p style="margin:0 0 6px 0;color:#4a4b44;font-size:14px;line-height:1.55;">&bull;&nbsp; This code expires in ${CODE_TTL_MINUTES} minutes.</p>
                    <p style="margin:0;color:#4a4b44;font-size:14px;line-height:1.55;">&bull;&nbsp; Once confirmed, your primary email can't be changed.</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px 32px 32px 32px;">
                    <div style="border-top:1px solid #ececE6;padding-top:18px;color:#8a8b80;font-size:12px;line-height:1.6;">
                      If you didn't ask for this, you can safely ignore this email. Nobody can use your account without this code.
                    </div>
                  </td>
                </tr>
              </table>
              <p style="margin:18px 0 0 0;color:#9d9e94;font-size:11px;letter-spacing:0.02em;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">Powered by Fyll</p>
            </td>
          </tr>
        </table>
      </body>
    </html>`
  const text = `Your Fyll verification code is ${code}. It expires in ${CODE_TTL_MINUTES} minutes. Once confirmed, your primary email can't be changed. If you didn't ask for this, ignore this email.`
  return { subject, html, text }
}

const sendEmail = async (to: string, message: { subject: string; html: string; text: string }) => {
  if (!RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    console.warn('Email is not configured (RESEND_API_KEY / RESEND_FROM_EMAIL).')
    return false
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM_EMAIL, to: [to], ...message }),
  })
  if (!response.ok) console.warn('Resend failed:', response.status, await response.text().catch(() => ''))
  return response.ok
}

// Stores a fresh code for the account and emails it. Returns whether the email went out.
const issueCode = async (accountId: string, businessId: string, email: string) => {
  const code = generateCode()
  const { error } = await admin().from('primary_email_codes').upsert({
    account_id: accountId,
    business_id: businessId,
    code_hash: await hashCode(accountId, code),
    expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
    attempts: 0,
    last_sent_at: new Date().toISOString(),
  })
  if (error) throw new HttpError(500, 'code_failed', 'Could not create a verification code. Please try again.')

  const { data: business } = await admin().from('businesses').select('name').eq('id', businessId).maybeSingle()
  return sendEmail(email, buildCodeEmail(code, String(business?.name ?? '')))
}

const getPendingLink = async (businessId: string) => {
  const { data: links } = await admin()
    .from('account_business_links')
    .select('account_id, status')
    .eq('business_id', businessId)
    .limit(1)
  const link = links?.[0] as { account_id: string; status: string } | undefined
  if (!link) return null
  const { data: account } = await admin().from('fyll_accounts').select('id, primary_email').eq('id', link.account_id).maybeSingle()
  if (!account) return null
  return { accountId: account.id as string, email: account.primary_email as string, status: link.status as string }
}

const linkBusiness = async (accountId: string, businessId: string, linkedBy: string, activate: boolean) => {
  const { data, error } = await admin().rpc('link_primary_account', {
    p_account: accountId,
    p_business: businessId,
    p_linked_by: linkedBy,
    p_activate: activate,
  })
  if (error) throw new HttpError(500, 'link_failed', 'Could not link the business. Please try again.')
  return String(data ?? 'pending')
}

const assertBusinessHasNoOtherPrimary = async (businessId: string, accountId?: string) => {
  const { data } = await admin()
    .from('account_business_links')
    .select('account_id')
    .eq('business_id', businessId)
  const others = (data ?? []).filter((row: { account_id: string }) => row.account_id !== accountId)
  if (others.length > 0) {
    throw new HttpError(409, 'primary_exists', 'This business already has a primary email.')
  }
}

const handleLink = async (caller: { id: string }, body: Record<string, unknown>) => {
  await assertReady()
  const businessId = await getAdminBusinessId(caller.id)
  if (await isPrimaryAccount(caller.id)) {
    throw new HttpError(403, 'not_work_login', 'Sign in with the business login to add a primary email.')
  }

  const email = normalizeEmail(body.email)
  const password = String(body.password ?? '')
  const name = String(body.name ?? '').trim()
  if (!EMAIL_PATTERN.test(email)) throw new HttpError(400, 'invalid_email', 'Enter a valid email address.')
  if (password.length < 8) throw new HttpError(400, 'weak_password', 'Use a password with at least 8 characters.')

  const db = admin()

  // A confirmed primary email is permanent. An unconfirmed one (a typo, say) can be replaced.
  const current = await getPendingLink(businessId)
  if (current) {
    if (current.status === 'active') {
      throw new HttpError(409, 'primary_locked', "This business's primary email is confirmed and can't be changed.")
    }
    const { data: confirmedUser } = await db.auth.admin.getUserById(current.accountId)
    if (confirmedUser.user?.email_confirmed_at) {
      throw new HttpError(409, 'primary_locked', "This business's primary email is confirmed and can't be changed.")
    }
    await db.auth.admin.deleteUser(current.accountId)
  }

  const created = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { account_kind: 'primary', name: name || undefined },
  })

  if (!created.error && created.data.user) {
    const status = await linkBusiness(created.data.user.id, businessId, caller.id, false)
    const emailSent = await issueCode(created.data.user.id, businessId, email)
    return { status, email, emailSent }
  }

  // The email already has a login. Only a primary account may be reused, and only
  // by proving the password; an email already used as a work login is refused.
  const { data: existing } = await db.from('fyll_accounts').select('id').ilike('primary_email', email).maybeSingle()
  if (!existing) {
    throw new HttpError(409, 'email_in_use', 'That email is already used as a Fyll login. Use a different email.')
  }

  const { data: signedIn, error: signInError } = await anon().auth.signInWithPassword({ email, password })
  if (signInError || !signedIn.user) {
    throw new HttpError(403, 'wrong_password', 'That primary email exists, but the password is not correct.')
  }
  const verified = Boolean(signedIn.user.email_confirmed_at)
  const status = await linkBusiness(existing.id, businessId, caller.id, verified)
  const emailSent = verified ? false : await issueCode(existing.id, businessId, email)
  return { status, email, emailSent }
}

const handlePromote = async (caller: { id: string; email?: string | null; email_confirmed_at?: string | null }) => {
  await assertReady()
  const businessId = await getAdminBusinessId(caller.id)
  const email = normalizeEmail(caller.email)
  if (!email || !caller.email_confirmed_at) {
    throw new HttpError(400, 'email_unverified', 'Confirm your login email before using it as your primary email.')
  }

  if (await isPrimaryAccount(caller.id)) return { status: 'active', email }

  const db = admin()
  const current = await getPendingLink(businessId)
  if (current) {
    const { data: other } = await db.auth.admin.getUserById(current.accountId)
    if (current.status === 'active' || other.user?.email_confirmed_at) {
      throw new HttpError(409, 'primary_locked', "This business's primary email is confirmed and can't be changed.")
    }
    await db.auth.admin.deleteUser(current.accountId)
  }

  const { data: profile } = await db.from('profiles').select('name').eq('id', caller.id).maybeSingle()
  const { error: insertError } = await db.from('fyll_accounts').insert({
    id: caller.id,
    primary_email: email,
    name: (profile?.name as string | undefined) ?? email.split('@')[0],
  })
  if (insertError) throw new HttpError(409, 'email_in_use', 'That email is already used as a primary email.')

  try {
    await linkBusiness(caller.id, businessId, caller.id, true)
  } catch (error) {
    await db.from('fyll_accounts').delete().eq('id', caller.id)
    throw error
  }
  return { status: 'active', email }
}

const handleVerify = async (caller: { id: string }, body: Record<string, unknown>) => {
  const businessId = await getAdminBusinessId(caller.id)
  const code = String(body.code ?? '').replace(/\s+/g, '')
  if (!/^\d{6}$/.test(code)) throw new HttpError(400, 'invalid_code', 'Enter the 6-digit code from the email.')

  const link = await getPendingLink(businessId)
  if (!link) throw new HttpError(404, 'no_pending_link', 'There is no primary email waiting to be confirmed.')
  if (link.status === 'active') return { status: 'active', email: link.email }

  const db = admin()
  const { data: row } = await db
    .from('primary_email_codes')
    .select('code_hash, expires_at, attempts')
    .eq('account_id', link.accountId)
    .maybeSingle()
  if (!row) throw new HttpError(400, 'no_code', 'Request a new code first.')
  if (new Date(row.expires_at as string).getTime() < Date.now()) {
    throw new HttpError(400, 'code_expired', 'That code has expired. Request a new one.')
  }
  if ((row.attempts as number) >= MAX_CODE_ATTEMPTS) {
    throw new HttpError(429, 'too_many_attempts', 'Too many wrong codes. Request a new one.')
  }

  const expected = String(row.code_hash)
  const actual = await hashCode(link.accountId, code)
  if (!safeEqual(expected, actual)) {
    await db.from('primary_email_codes').update({ attempts: (row.attempts as number) + 1 }).eq('account_id', link.accountId)
    throw new HttpError(400, 'wrong_code', 'That code is not correct.')
  }

  const { error: confirmError } = await db.auth.admin.updateUserById(link.accountId, { email_confirm: true })
  if (confirmError) throw new HttpError(500, 'confirm_failed', 'Could not confirm the email. Please try again.')
  await linkBusiness(link.accountId, businessId, caller.id, true)
  await db.from('primary_email_codes').delete().eq('account_id', link.accountId)
  return { status: 'active', email: link.email }
}

const handleResend = async (caller: { id: string }) => {
  const businessId = await getAdminBusinessId(caller.id)
  const link = await getPendingLink(businessId)
  if (!link || link.status === 'active') throw new HttpError(404, 'no_pending_link', 'There is no primary email waiting to be confirmed.')

  const { data: row } = await admin().from('primary_email_codes').select('last_sent_at').eq('account_id', link.accountId).maybeSingle()
  if (row?.last_sent_at && Date.now() - new Date(row.last_sent_at as string).getTime() < RESEND_COOLDOWN_SECONDS * 1000) {
    throw new HttpError(429, 'too_soon', 'A code was just sent. Wait a few seconds before asking for another.')
  }
  const emailSent = await issueCode(link.accountId, businessId, link.email)
  return { status: 'pending', email: link.email, emailSent }
}

const handleClaim = async (caller: { id: string }, body: Record<string, unknown>) => {
  await assertReady()
  if (!(await isPrimaryAccount(caller.id))) {
    throw new HttpError(403, 'not_primary', 'Only a primary Fyll account can claim a business.')
  }

  const workEmail = normalizeEmail(body.workEmail)
  const workPassword = String(body.workPassword ?? '')
  if (!EMAIL_PATTERN.test(workEmail) || !workPassword) {
    throw new HttpError(400, 'invalid_credentials', 'Enter the business login email and password.')
  }

  const { data: signedIn, error: signInError } = await anon().auth.signInWithPassword({ email: workEmail, password: workPassword })
  if (signInError || !signedIn.user) {
    throw new HttpError(403, 'wrong_password', 'Could not sign in with that business login. Check the email and password.')
  }
  if (await isPrimaryAccount(signedIn.user.id)) {
    throw new HttpError(400, 'not_work_login', 'That is a primary account. Use the business login email instead.')
  }

  const businessId = await getAdminBusinessId(signedIn.user.id)
  await assertBusinessHasNoOtherPrimary(businessId, caller.id)
  const status = await linkBusiness(caller.id, businessId, signedIn.user.id, true)
  return { status, businessId }
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' })

  try {
    const caller = await getCaller(request)
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const action = String(body.action ?? '')

    if (action === 'link') return jsonResponse(200, await handleLink(caller, body))
    if (action === 'promote') return jsonResponse(200, await handlePromote(caller))
    if (action === 'verify') return jsonResponse(200, await handleVerify(caller, body))
    if (action === 'resend') return jsonResponse(200, await handleResend(caller))
    if (action === 'claim') return jsonResponse(200, await handleClaim(caller, body))
    return jsonResponse(400, { error: 'Unknown action.', code: 'unknown_action' })
  } catch (error) {
    if (error instanceof HttpError) {
      return jsonResponse(error.status, { error: error.message, code: error.code })
    }
    console.error('primary-account failed:', error)
    return jsonResponse(500, { error: 'Something went wrong. Please try again.', code: 'server_error' })
  }
})
