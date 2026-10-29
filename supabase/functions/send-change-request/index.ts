// A business can't edit its business name or storefront handle itself (changing them breaks
// customer links), so the app lets them ask. This emails the request to Fyll support, with the
// business's current details looked up server-side and the requester set as reply-to.
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
const SUPPORT_EMAIL = sanitizeEnvValue(Deno.env.get('FYLL_SUPPORT_EMAIL')) || 'getfyll@gmail.com'
const ALLOWED_ORIGIN = sanitizeEnvValue(Deno.env.get('ALLOWED_ORIGIN')) || '*'

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonResponse = (status: number, body: Record<string, unknown>) => (
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
)

const toTrimmedString = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const KIND_LABELS: Record<string, string> = {
  business_name: 'Business name',
  storefront_handle: 'Storefront handle',
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed.' })
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !RESEND_API_KEY || !RESEND_FROM_EMAIL) {
    return jsonResponse(500, { error: 'Request service is not configured.' })
  }

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!token) return jsonResponse(401, { error: 'Please sign in again.' })

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  const user = authData?.user
  if (authError || !user?.id) return jsonResponse(401, { error: 'Please sign in again.' })

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const kind = toTrimmedString(body.kind)
  const requestedValue = toTrimmedString(body.requestedValue).slice(0, 120)
  const note = toTrimmedString(body.note).slice(0, 1000)
  if (!KIND_LABELS[kind]) return jsonResponse(400, { error: 'Unknown request type.' })
  if (!requestedValue) return jsonResponse(400, { error: 'Tell us what you would like it changed to.' })

  // Look up who is asking and which business, server-side, so the email can be trusted.
  const { data: profile } = await admin.from('profiles').select('business_id, name, email').eq('id', user.id).maybeSingle()
  const { data: teamMember } = await admin.from('team_members').select('business_id, name, email').eq('user_id', user.id).maybeSingle()
  const businessId = toTrimmedString(profile?.business_id) || toTrimmedString(teamMember?.business_id)
  if (!businessId) return jsonResponse(403, { error: 'Business access denied.' })

  const { data: business } = await admin.from('businesses').select('id, name, data').eq('id', businessId).maybeSingle()
  const data = (business?.data ?? {}) as Record<string, unknown>
  const requesterName = toTrimmedString(profile?.name) || toTrimmedString(teamMember?.name) || 'A Fyll user'
  const requesterEmail = toTrimmedString(user.email) || toTrimmedString(profile?.email) || toTrimmedString(teamMember?.email)
  const businessName = toTrimmedString(data.businessName) || toTrimmedString(business?.name) || businessId
  const currentValue = kind === 'storefront_handle'
    ? toTrimmedString(data.storefrontSlug) || '(not set)'
    : businessName
  const label = KIND_LABELS[kind]

  // Save the request so it shows up in the Fyll console (Requests) and can be approved there. The email below
  // still goes out; if saving fails we still send the email so the request is never lost.
  const { error: saveError } = await admin.from('business_change_requests').insert({
    business_id: businessId,
    kind,
    current_value: currentValue,
    requested_value: requestedValue,
    note: note || null,
    requester_user_id: user.id,
    requester_name: requesterName,
    requester_email: requesterEmail || null,
  })
  if (saveError) console.error('send-change-request: could not save the request', saveError.message)
  const saved = !saveError

  const rows: Array<[string, string]> = [
    ['Request', `Change ${label.toLowerCase()}`],
    ['Business', businessName],
    ['Business ID', businessId],
    [`Current ${label.toLowerCase()}`, currentValue],
    [`Requested ${label.toLowerCase()}`, requestedValue],
    ['Requested by', `${requesterName}${requesterEmail ? ` <${requesterEmail}>` : ''}`],
    ['Note', note || '—'],
  ]
  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;color:#141414;max-width:560px">
<h2 style="margin:0 0 14px;font-size:20px">${escapeHtml(label)} change request</h2>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">
${rows.map(([key, value]) => `<tr><td style="padding:8px 12px 8px 0;color:#6b6c63;vertical-align:top;white-space:nowrap">${escapeHtml(key)}</td><td style="padding:8px 0;font-weight:600">${escapeHtml(value)}</td></tr>`).join('')}
</table>
<p style="margin:18px 0 0;color:#6b6c63;font-size:13px">Approve or decline it in the Fyll console (Requests tab), or apply it under Businesses → this business. Reply to this email to reach the requester.</p>
</div>`
  const text = rows.map(([key, value]) => `${key}: ${value}`).join('\n')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: RESEND_FROM_EMAIL,
      to: [SUPPORT_EMAIL],
      ...(requesterEmail ? { reply_to: requesterEmail } : {}),
      subject: `${label} change request — ${businessName}`,
      html,
      text,
    }),
  })
  if (!response.ok) {
    console.error('send-change-request: Resend failed', await response.text().catch(() => ''))
    // Saved in the console even though the email failed: the request is not lost.
    if (saved) return jsonResponse(200, { success: true, emailed: false })
    return jsonResponse(502, { error: 'Could not send your request. Please try again.' })
  }
  return jsonResponse(200, { success: true })
})
