// Supabase Auth "Send Email" hook: every auth email (password reset, invite, magic link, …)
// is sent from Fyll (via Resend) instead of Supabase's default sender and template.
//
// Enable under Authentication → Hooks → Send Email → HTTPS, pointing at this function, and set
// the hook secret as SEND_EMAIL_HOOK_SECRET ("v1,whsec_…"). Needs RESEND_API_KEY and
// RESEND_FROM_EMAIL (shared with the other Fyll emails).
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0'

const sanitizeEnvValue = (value: string | undefined | null) => (
  (value ?? '')
    .normalize('NFKC')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
)

const SUPABASE_URL = sanitizeEnvValue(Deno.env.get('SUPABASE_URL')).replace(/\/+$/, '')
const RESEND_API_KEY = sanitizeEnvValue(Deno.env.get('RESEND_API_KEY'))
const RESEND_FROM_EMAIL = sanitizeEnvValue(Deno.env.get('RESEND_FROM_EMAIL'))
const HOOK_SECRET = sanitizeEnvValue(Deno.env.get('SEND_EMAIL_HOOK_SECRET')).replace('v1,whsec_', '')
const FYLL_WORDMARK_LIGHT_URL = SUPABASE_URL
  ? `${SUPABASE_URL}/storage/v1/object/public/business-assets/fyll/fyll-wordmark-email-light.png`
  : ''
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"

type EmailActionType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'reauthentication' | string

type HookPayload = {
  user: { email?: string; new_email?: string; user_metadata?: Record<string, unknown> }
  email_data: {
    token: string
    token_hash: string
    redirect_to: string
    email_action_type: EmailActionType
    site_url: string
    token_new?: string
    token_hash_new?: string
  }
}

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

const buildVerifyUrl = (tokenHash: string, type: string, redirectTo: string) => {
  const url = new URL(`${SUPABASE_URL}/auth/v1/verify`)
  url.searchParams.set('token', tokenHash)
  url.searchParams.set('type', type)
  if (redirectTo) url.searchParams.set('redirect_to', redirectTo)
  return url.toString()
}

// The shared Fyll email look: charcoal header with the wordmark, white body, lime button.
const renderEmail = ({
  preheader, headline, intro, buttonLabel, buttonUrl, code, note,
}: {
  preheader: string
  headline: string
  intro: string
  buttonLabel?: string
  buttonUrl?: string
  code?: string
  note: string
}) => {
  const logo = FYLL_WORDMARK_LIGHT_URL
    ? `<img src="${FYLL_WORDMARK_LIGHT_URL}" height="30" alt="Fyll" style="display:block;height:30px;width:auto;border:0;outline:none;text-decoration:none;"><div style="height:34px;line-height:34px;font-size:0;">&nbsp;</div>`
    : ''
  const button = buttonUrl && buttonLabel
    ? `<tr><td align="center" style="background:#ffffff;padding:28px 28px 0;"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#d5e057" style="border-radius:999px;"><a href="${escapeHtml(buttonUrl)}" style="display:inline-block;padding:16px 34px;font-family:${FONT};font-size:16px;font-weight:700;color:#141414;text-decoration:none;border-radius:999px;">${escapeHtml(buttonLabel)}</a></td></tr></table></td></tr>`
    : ''
  const codeBlock = code
    ? `<tr><td align="center" style="background:#ffffff;padding:28px 28px 0;"><div style="display:inline-block;padding:14px 26px;border-radius:14px;background:#f2f2ec;font-family:${FONT};font-size:30px;font-weight:700;letter-spacing:6px;color:#141414;">${escapeHtml(code)}</div></td></tr>`
    : ''
  const linkFallback = buttonUrl
    ? `<div style="font-size:12.5px;line-height:19px;color:#8c8d84;padding-top:14px;word-break:break-all;">Button not working? Paste this link into your browser:<br>${escapeHtml(buttonUrl)}</div>`
    : ''

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Fyll</title></head>
<body style="margin:0;padding:0;background:#e9e9e3;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e9e9e3;"><tr><td align="center" style="padding:28px 12px 40px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
<tr><td bgcolor="#141414" style="background:#141414;border-radius:24px 24px 0 0;padding:28px 28px 32px;">
  ${logo}
  <div style="font-family:${FONT};font-size:30px;line-height:36px;font-weight:700;letter-spacing:-0.8px;color:#f4f4ef;">${escapeHtml(headline)}</div>
  <div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>
  <div style="font-family:${FONT};font-size:15.5px;line-height:23px;color:#b9bab0;">${escapeHtml(intro)}</div>
</td></tr>
${button}${codeBlock}
<tr><td style="background:#ffffff;padding:24px 28px 30px;border-radius:0 0 24px 24px;font-family:${FONT};">
  <div style="font-size:14.5px;line-height:22px;color:#5f6058;">${escapeHtml(note)}</div>
  ${linkFallback}
  <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
  <div style="font-size:14.5px;font-weight:600;color:#141414;">The Fyll team</div>
</td></tr>
</table></td></tr></table>
</body></html>`
}

const buildEmails = (payload: HookPayload) => {
  const { user, email_data: data } = payload
  const type = data.email_action_type
  const link = (hash: string) => buildVerifyUrl(hash, type, data.redirect_to)
  const ignoreNote = "If you didn't ask for this, you can safely ignore this email. Nothing will change."

  const emails: Array<{ to: string; subject: string; html: string; text: string }> = []
  const add = (to: string, subject: string, fields: Parameters<typeof renderEmail>[0]) => {
    emails.push({
      to,
      subject,
      html: renderEmail(fields),
      text: [fields.headline, '', fields.intro, fields.buttonUrl ? `${fields.buttonLabel}: ${fields.buttonUrl}` : '', fields.code ? `Code: ${fields.code}` : '', '', fields.note].filter(Boolean).join('\n'),
    })
  }
  const to = user.email ?? ''

  switch (type) {
    case 'recovery': {
      const url = link(data.token_hash)
      add(to, 'Reset your Fyll password', {
        preheader: 'Choose a new password for your Fyll account.',
        headline: 'Reset your password',
        intro: 'We got a request to reset the password on your Fyll account. Tap the button to choose a new one. The link works once and expires soon.',
        buttonLabel: 'Choose a new password',
        buttonUrl: url,
        note: ignoreNote,
      })
      break
    }
    case 'signup': {
      const url = link(data.token_hash)
      add(to, 'Confirm your email for Fyll', {
        preheader: 'One tap to confirm your email.',
        headline: 'Confirm your email',
        intro: 'Welcome to Fyll. Confirm your email address to finish setting up your account.',
        buttonLabel: 'Confirm email',
        buttonUrl: url,
        note: ignoreNote,
      })
      break
    }
    case 'invite': {
      const url = link(data.token_hash)
      add(to, "You've been invited to Fyll", {
        preheader: 'Accept your invite to join your team on Fyll.',
        headline: "You're invited to Fyll",
        intro: 'You have been invited to join a team on Fyll. Accept the invite to set up your account.',
        buttonLabel: 'Accept invite',
        buttonUrl: url,
        note: ignoreNote,
      })
      break
    }
    case 'magiclink': {
      const url = link(data.token_hash)
      add(to, 'Your Fyll sign-in link', {
        preheader: 'Tap to sign in to Fyll.',
        headline: 'Sign in to Fyll',
        intro: 'Tap the button to sign in. The link works once and expires soon.',
        buttonLabel: 'Sign in',
        buttonUrl: url,
        note: ignoreNote,
      })
      break
    }
    case 'email_change': {
      // With secure email change both addresses confirm; otherwise a single link is enough.
      const newEmail = user.new_email ?? ''
      if (newEmail && data.token_hash_new) {
        add(newEmail, 'Confirm your new Fyll email', {
          preheader: 'Confirm your new email address.',
          headline: 'Confirm your new email',
          intro: `Confirm ${newEmail} as the email for your Fyll account.`,
          buttonLabel: 'Confirm new email',
          buttonUrl: link(data.token_hash_new),
          note: ignoreNote,
        })
      }
      if (to) {
        add(to, 'Confirm your Fyll email change', {
          preheader: 'Confirm the change to your Fyll email.',
          headline: 'Confirm your email change',
          intro: 'We got a request to change the email on your Fyll account. Confirm it to continue.',
          buttonLabel: 'Confirm change',
          buttonUrl: link(data.token_hash),
          note: ignoreNote,
        })
      }
      break
    }
    case 'reauthentication': {
      add(to, `Your Fyll verification code: ${data.token}`, {
        preheader: `Your code is ${data.token}.`,
        headline: 'Your verification code',
        intro: 'Enter this code to confirm it is really you.',
        code: data.token,
        note: ignoreNote,
      })
      break
    }
    default:
      throw new Error(`Unsupported auth email type: ${type}`)
  }
  return emails.filter((email) => email.to)
}

const sendViaResend = async (email: { to: string; subject: string; html: string; text: string }) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM_EMAIL, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    throw new Error(`Resend failed: ${JSON.stringify(body)}`)
  }
}

// The hook contract: 200 with an empty JSON body on success, or { error: { http_code, message } }.
const hookError = (status: number, message: string) => (
  new Response(JSON.stringify({ error: { http_code: status, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
)

serve(async (req: Request) => {
  if (req.method !== 'POST') return hookError(405, 'Method not allowed.')
  if (!SUPABASE_URL || !RESEND_API_KEY || !RESEND_FROM_EMAIL || !HOOK_SECRET) {
    return hookError(500, 'Auth email hook is not configured.')
  }

  const rawBody = await req.text()
  let payload: HookPayload
  try {
    const headers = Object.fromEntries(req.headers)
    payload = new Webhook(HOOK_SECRET).verify(rawBody, headers) as HookPayload
  } catch {
    return hookError(401, 'Invalid webhook signature.')
  }

  try {
    for (const email of buildEmails(payload)) {
      await sendViaResend(email)
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    console.error('send-auth-email failed:', error)
    return hookError(500, error instanceof Error ? error.message : 'Could not send auth email.')
  }
})
