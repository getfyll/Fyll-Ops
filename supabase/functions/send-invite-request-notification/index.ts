import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Two emails go out when someone submits the "Request an invitation" form:
//  1. a confirmation to the applicant, and
//  2. a summary to the Fyll team (reply-to is the applicant).
// Both use the same look as the welcome emails: charcoal header with the Fyll wordmark, white body.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NOTIFY_TO_EMAIL = 'getfyll@gmail.com';
const CONSOLE_URL = 'https://console.fyll.app';
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

type SendInviteRequestPayload = {
  fullName?: string;
  email?: string;
  businessName?: string;
  message?: string;
  refundPolicy?: boolean;
  returnPolicy?: boolean;
  deliveryPolicy?: boolean;
  instagramHandle?: string;
  tiktokHandle?: string;
};

// The form fields are typed by visitors, so escape them before they go into the email HTML.
const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

const clip = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const firstName = (name: string) => name.split(/\s+/).filter(Boolean)[0] || 'there';
const handleSlug = (handle: string) => handle.replace(/^@+/, '').replace(/[^A-Za-z0-9._]/g, '');

const jsonResponse = (status: number, body: Record<string, unknown>) => (
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
);

const storageUrl = (file: string) => {
  const base = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
  return base ? `${base}/storage/v1/object/public/business-assets/fyll/${file}` : '';
};

// ── Shared pieces ──────────────────────────────────────────────────────────
// No page background: the email is the card, sitting on the mail app's own background. Colours that
// have to change in dark mode carry a class (m-*); clients that support prefers-color-scheme (Apple
// Mail, Outlook, iOS) switch them. Gmail does its own colour flip, so the logo is a dark wordmark with
// a faint light outline: it reads on white and still shows as an outline on a dark card.

const DARK_MODE_CSS = `
:root{color-scheme:light dark;supported-color-schemes:light dark}
.logo-on-dark{display:none !important}
@media (prefers-color-scheme: dark){
  .logo-on-light{display:none !important}
  .logo-on-dark{display:block !important}
  .m-card{background:#1c1c1b !important;border-color:#2e2e2b !important}
  .m-ink{color:#f4f4ef !important}
  .m-body{color:#c9cabf !important}
  .m-muted{color:#9d9e94 !important}
  .m-soft{background:#262624 !important}
  .m-line{border-color:#34342f !important}
  .m-dot{background:#f4f4ef !important;color:#141414 !important}
  .m-link{color:#f4f4ef !important}
  .m-ghost{border-color:#4a4a45 !important}
  .m-ghost a{color:#f4f4ef !important}
  .m-yes{background:#2b3012 !important;color:#d5e057 !important}
  .m-no{background:#3a2420 !important;color:#f0a498 !important}
}`;

const renderShell = ({
  preheader,
  topLine,
  eyebrow,
  headline,
  intro,
  bodyHtml,
  closingHtml,
  reason,
}: {
  preheader: string;
  topLine?: string;
  eyebrow?: string;
  headline: string;
  intro: string;
  bodyHtml: string;
  closingHtml: string;
  reason?: string;
}) => {
  const onLight = storageUrl('fyll-wordmark-email-dark.png');
  const onDark = storageUrl('fyll-wordmark-email-light-v2.png');
  const logo = onLight
    ? `<img class="logo-on-light" src="${onLight}" height="28" alt="Fyll" style="display:block;height:28px;width:auto;border:0;outline:none;text-decoration:none;">
       <img class="logo-on-dark" src="${onDark}" height="28" alt="" style="display:none;height:28px;width:auto;border:0;outline:none;text-decoration:none;">`
    : '';
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>Fyll</title><style>${DARK_MODE_CSS}</style></head>
<body style="margin:0;padding:0;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" style="padding:12px 8px 24px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
<tr><td class="m-card" bgcolor="#ffffff" style="background:#ffffff;border:1px solid #e6e6df;border-radius:20px;padding:22px 20px 22px;font-family:${FONT};">
  ${logo}
  ${spacer(22)}
  ${topLine ? `<div class="m-muted" style="font-size:15px;line-height:21px;color:#6b6c63;">${escapeHtml(topLine)}</div>${spacer(4)}` : ''}
  ${eyebrow ? `<div style="font-size:11.5px;font-weight:500;letter-spacing:1px;text-transform:uppercase;color:#7c8a12;padding-bottom:6px;">${escapeHtml(eyebrow)}</div>` : ''}
  <div class="m-ink" style="font-size:28px;line-height:33px;font-weight:600;letter-spacing:-0.6px;color:#141414;">${escapeHtml(headline)}</div>
  ${spacer(10)}
  <div class="m-body" style="font-size:15px;line-height:22px;color:#5f6058;">${intro}</div>
  ${spacer(20)}
  ${bodyHtml}
  ${spacer(20)}
  <div style="border-top:1px solid #ecece6;" class="m-line">${spacer(16)}</div>
  ${closingHtml}
</td></tr>
${reason ? `<tr><td align="center" style="padding:18px 12px 0;font-family:${FONT};"><div style="font-size:12px;line-height:18px;color:#8c8d84;">${escapeHtml(reason)}</div></td></tr>` : ''}
</table></td></tr></table>
</body>
</html>`;
};

const spacer = (px: number) => `<div style="height:${px}px;line-height:${px}px;font-size:0;">&nbsp;</div>`;

const sectionTitle = (text: string, paddingBottom = 10) => (
  `<div class="m-ink" style="font-size:17px;font-weight:600;letter-spacing:-0.2px;color:#141414;padding-bottom:${paddingBottom}px;">${escapeHtml(text)}</div>`
);

const renderStep = (index: number, title: string, text: string, isLast: boolean) => `
<tr><td style="padding:${index === 1 ? '0' : '10px'} 0 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
    <td width="38" valign="top"><div class="m-dot" style="width:26px;height:26px;border-radius:13px;background:#141414;color:#f4f4ef;font-size:12.5px;font-weight:600;line-height:26px;text-align:center;">${index}</div></td>
    <td valign="top" class="m-line" style="padding-bottom:10px;border-bottom:${isLast ? '0' : '1px solid #ecece6'};">
      <div class="m-ink" style="font-size:15px;font-weight:500;color:#141414;line-height:21px;">${escapeHtml(title)}</div>
      <div class="m-muted" style="font-size:13.5px;line-height:20px;color:#6b6c63;padding-top:2px;">${escapeHtml(text)}</div>
    </td>
  </tr></table>
</td></tr>`;

// A grey card of label / value rows. Values are pre-escaped HTML (they may contain links).
const renderDetailsCard = (rows: Array<[string, string]>) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="m-soft" bgcolor="#f4f4ef" style="background:#f4f4ef;border-radius:16px;padding:4px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${rows.map(([label, valueHtml], index) => `
    <tr>
      <td valign="top" class="m-muted m-line" style="padding:9px 12px 9px 0;border-top:${index === 0 ? '0' : '1px solid #e3e3db'};font-size:14px;line-height:20px;color:#6b6c63;white-space:nowrap;">${escapeHtml(label)}</td>
      <td align="right" valign="top" class="m-ink m-line" style="padding:9px 0;border-top:${index === 0 ? '0' : '1px solid #e3e3db'};font-size:14px;line-height:20px;font-weight:500;color:#141414;word-break:break-word;">${valueHtml}</td>
    </tr>`).join('')}
  </table>
</td></tr></table>`;

const renderQuote = (label: string, text: string) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td class="m-soft" bgcolor="#f4f4ef" style="background:#f4f4ef;border-radius:14px;padding:12px 16px;">
  <div class="m-muted" style="font-size:11px;font-weight:500;letter-spacing:1px;text-transform:uppercase;color:#6b6c63;padding-bottom:3px;">${escapeHtml(label)}</div>
  <div class="m-body" style="font-size:14px;line-height:21px;color:#3a3b34;white-space:pre-wrap;">${escapeHtml(text)}</div>
</td></tr></table>`;

const renderCallout = (label: string, text: string) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#141414" style="background:#141414;border-radius:16px;padding:14px 18px;">
  <div style="font-size:11px;font-weight:500;letter-spacing:1px;text-transform:uppercase;color:#d5e057;">${escapeHtml(label)}</div>
  <div style="font-size:14px;line-height:21px;color:#f4f4ef;padding-top:4px;">${escapeHtml(text)}</div>
</td></tr></table>`;

// ── Email 1: to the applicant ──────────────────────────────────────────────

const buildApplicantEmail = (request: {
  fullName: string;
  email: string;
  businessName: string;
  message: string;
  instagramHandle: string;
  tiktokHandle: string;
}) => {
  const first = firstName(request.fullName);
  const rows: Array<[string, string]> = [
    ['Business', escapeHtml(request.businessName)],
    ['Email', escapeHtml(request.email)],
  ];
  if (request.instagramHandle) rows.push(['Instagram', escapeHtml(request.instagramHandle)]);
  if (request.tiktokHandle) rows.push(['TikTok', escapeHtml(request.tiktokHandle)]);

  const bodyHtml = `
${sectionTitle('What happens next')}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    ${renderStep(1, 'We look at your business', 'We read what you sent and have a look at your page.', false)}
    ${renderStep(2, 'You hear from us by email', 'If it’s a good fit, we send you an invite code.', false)}
    ${renderStep(3, 'Set up in about 15 minutes', 'Add your products, take your first order, invite your team.', true)}
  </table>
  ${spacer(16)}
  ${renderDetailsCard(rows)}
  ${spacer(10)}
  ${renderQuote('Your message', request.message)}
  ${spacer(16)}
  ${renderCallout('While you wait', `Keep an eye on ${request.email}, and check spam too. Our reply comes from hello@fyll.app.`)}`;

  const html = renderShell({
    preheader: 'Fyll Ops is invite-only. Here is what happens next.',
    topLine: `Hi ${first},`,
    headline: 'Your request is in.',
    intro: 'Thanks for asking about Fyll Ops. We let businesses in a few at a time and read every request ourselves, so it can take a little while to hear back.',
    bodyHtml,
    closingHtml: `
      <div class="m-body" style="font-size:14px;line-height:21px;color:#5f6058;">Anything to add? Reply to this email and it reaches us. A real person reads it.</div>
      ${spacer(8)}
      <div class="m-ink" style="font-size:14px;font-weight:500;color:#141414;">The Fyll team</div>`,
    reason: 'You’re getting this because you asked for an invitation on fyll.app.',
  });

  const text = [
    `Hi ${first},`,
    '',
    'Your request is in.',
    'Thanks for asking about Fyll Ops. We let businesses in a few at a time and read every request ourselves, so it can take a little while to hear back.',
    '',
    'WHAT HAPPENS NEXT',
    '1. We look at your business: we read what you sent and have a look at your page.',
    '2. You hear from us by email: if it’s a good fit, we send you an invite code.',
    '3. Set up in about 15 minutes: add your products, take your first order, invite your team.',
    '',
    'WHAT YOU SENT',
    ...rows.map(([label, value]) => `${label}: ${value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')}`),
    `Message: ${request.message}`,
    '',
    `While you wait: keep an eye on ${request.email}, and check spam too. Our reply comes from hello@fyll.app.`,
    '',
    'Anything to add? Reply to this email and it reaches us. A real person reads it.',
    'The Fyll team',
  ].join('\n');

  return { subject: `We got your request, ${first}`, html, text };
};

// ── Email 2: to the Fyll team ──────────────────────────────────────────────

const policyPill = (label: string, has: boolean | undefined) => {
  if (has === undefined) return '';
  const colors = has ? { cls: 'm-yes', bg: '#eef2c4', ink: '#4a5200', mark: '&#10003;' } : { cls: 'm-no', bg: '#f6e3df', ink: '#9a3a2f', mark: '&#10005;' };
  return `<span class="${colors.cls}" style="display:inline-block;margin:0 6px 6px 0;padding:5px 11px;border-radius:999px;background:${colors.bg};color:${colors.ink};font-size:12.5px;font-weight:500;line-height:18px;">${colors.mark}&nbsp; ${escapeHtml(label)}</span>`;
};

const buildTeamEmail = (request: {
  fullName: string;
  email: string;
  businessName: string;
  message: string;
  instagramHandle: string;
  tiktokHandle: string;
  refundPolicy?: boolean;
  returnPolicy?: boolean;
  deliveryPolicy?: boolean;
}) => {
  const first = firstName(request.fullName);
  const business = request.businessName || 'A business';
  const policies: Array<[string, boolean | undefined]> = [
    ['Refund policy', request.refundPolicy],
    ['Return policy', request.returnPolicy],
    ['Delivery policy', request.deliveryPolicy],
  ];
  const has = policies.filter(([, value]) => value === true).map(([label]) => label.split(' ')[0].toLowerCase());
  const lacks = policies.filter(([, value]) => value === false).map(([label]) => label.split(' ')[0].toLowerCase());
  const policySummary = lacks.length === 0
    ? 'Refund, return and delivery policies in place.'
    : has.length === 0
      ? 'No refund, return or delivery policy yet.'
      : `${has.join(' and ')} policy in place, ${lacks.join(' and ')} not yet.`.replace(/^./, (c) => c.toUpperCase());

  const linkStyle = 'color:#141414;text-decoration:underline;';
  const linkClass = 'm-link';
  const rows: Array<[string, string]> = [
    ['Name', escapeHtml(request.fullName)],
    ['Email', `<a class="m-link" href="mailto:${encodeURIComponent(request.email)}" style="${linkStyle}">${escapeHtml(request.email)}</a>`],
    ['Business', escapeHtml(request.businessName)],
  ];
  const instagram = handleSlug(request.instagramHandle);
  const tiktok = handleSlug(request.tiktokHandle);
  if (instagram) rows.push(['Instagram', `<a class="m-link" href="https://instagram.com/${instagram}" style="${linkStyle}">@${escapeHtml(instagram)}</a>`]);
  if (tiktok) rows.push(['TikTok', `<a class="m-link" href="https://www.tiktok.com/@${tiktok}" style="${linkStyle}">@${escapeHtml(tiktok)}</a>`]);

  const replySubject = `Re: your Fyll invitation request`;
  const replyHref = `mailto:${encodeURIComponent(request.email)}?subject=${encodeURIComponent(replySubject)}`;

  const bodyHtml = `${sectionTitle('Their policies', 8)}
  <div>${policies.map(([label, value]) => policyPill(label, value)).join('')}</div>
  ${spacer(10)}
  ${renderDetailsCard(rows)}
  ${spacer(10)}
  ${renderQuote('Their message', request.message)}
  ${spacer(16)}
  ${renderCallout('To approve', `Create an invite code in the console, then reply with their link. Reply goes straight to ${first}.`)}
  ${spacer(18)}
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td bgcolor="#d5e057" style="border-radius:999px;"><a href="${replyHref}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:500;color:#141414;text-decoration:none;border-radius:999px;">Reply to ${escapeHtml(first)}</a></td>
    <td width="8">&nbsp;</td>
    <td class="m-ghost" style="border:1.5px solid #d9d9d0;border-radius:999px;"><a href="${CONSOLE_URL}" style="display:inline-block;padding:10.5px 20.5px;font-size:14px;font-weight:500;color:#141414;text-decoration:none;border-radius:999px;">Open console</a></td>
  </tr></table>`;

  const html = renderShell({
    preheader: `${policySummary} Reply goes to ${first}.`,
    eyebrow: 'Access request',
    headline: `${business} wants in.`,
    intro: `${escapeHtml(request.fullName)} asked for an invitation on fyll.app just now.`,
    bodyHtml,
    closingHtml: `<div style="font-size:12.5px;line-height:19px;color:#8c8d84;">Sent from the Request an Invitation form on fyll.app.</div>`,
  });

  const text = [
    `New access request: ${business} (${request.fullName})`,
    '',
    `Policies: ${policies.map(([label, value]) => `${label} ${value === undefined ? '?' : value ? 'yes' : 'no'}`).join(', ')}`,
    `Name: ${request.fullName}`,
    `Email: ${request.email}`,
    `Business: ${request.businessName}`,
    request.instagramHandle ? `Instagram: ${request.instagramHandle}` : '',
    request.tiktokHandle ? `TikTok: ${request.tiktokHandle}` : '',
    '',
    `Message: ${request.message}`,
    '',
    `To approve: create an invite code in the console (${CONSOLE_URL}), then reply with their link.`,
  ].filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n');

  return { subject: `New access request: ${business} (${request.fullName})`, html, text };
};

// ── Sending ────────────────────────────────────────────────────────────────

const sendEmail = async ({
  apiKey,
  from,
  to,
  replyTo,
  subject,
  html,
  text,
}: {
  apiKey: string;
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
}) => {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [to], reply_to: replyTo, subject, html, text }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Resend failed: ${JSON.stringify(data)}`);
  return data;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL');
    if (!resendApiKey) return jsonResponse(500, { success: false, error: 'Missing RESEND_API_KEY function secret' });
    if (!resendFromEmail) return jsonResponse(500, { success: false, error: 'Missing RESEND_FROM_EMAIL function secret' });

    const body = (await req.json().catch(() => ({}))) as SendInviteRequestPayload;
    const request = {
      fullName: clip(body.fullName, 200) || 'Someone',
      email: clip(body.email, 320).toLowerCase(),
      businessName: clip(body.businessName, 200),
      message: clip(body.message, 2000),
      instagramHandle: clip(body.instagramHandle, 100),
      tiktokHandle: clip(body.tiktokHandle, 100),
      refundPolicy: typeof body.refundPolicy === 'boolean' ? body.refundPolicy : undefined,
      returnPolicy: typeof body.returnPolicy === 'boolean' ? body.returnPolicy : undefined,
      deliveryPolicy: typeof body.deliveryPolicy === 'boolean' ? body.deliveryPolicy : undefined,
    };

    if (!request.email || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(request.email)) {
      return jsonResponse(400, { success: false, error: 'Valid email is required' });
    }

    // Only email for a request that was saved in the last few minutes and not confirmed yet. Anyone
    // can call this function, so without this check it could be used to email any address.
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) return jsonResponse(500, { success: false, error: 'Function is not configured' });
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: pending, error: pendingError } = await admin
      .from('invitation_requests')
      .select('id')
      .eq('email', request.email)
      .is('confirmation_sent_at', null)
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1);
    if (pendingError) throw pendingError;
    const pendingId = pending?.[0]?.id as string | undefined;
    if (!pendingId) {
      return jsonResponse(404, { success: false, error: 'No recent request found for this email' });
    }

    const from = resendFromEmail.includes('<') ? resendFromEmail : `Fyll <${resendFromEmail}>`;
    const team = buildTeamEmail(request);
    const applicant = buildApplicantEmail(request);

    // The team email is the one that matters; the confirmation to the applicant must not block it.
    const [teamResult, applicantResult] = await Promise.allSettled([
      sendEmail({ apiKey: resendApiKey, from, to: NOTIFY_TO_EMAIL, replyTo: request.email, ...team }),
      sendEmail({ apiKey: resendApiKey, from, to: request.email, replyTo: NOTIFY_TO_EMAIL, ...applicant }),
    ]);

    if (teamResult.status === 'fulfilled') {
      await admin.from('invitation_requests').update({ confirmation_sent_at: new Date().toISOString() }).eq('id', pendingId);
    }

    if (applicantResult.status === 'rejected') {
      console.warn('Applicant confirmation email failed:', applicantResult.reason);
    }
    if (teamResult.status === 'rejected') {
      return jsonResponse(502, { success: false, error: 'Resend API request failed', details: String(teamResult.reason) });
    }

    return jsonResponse(200, {
      success: true,
      team: teamResult.value,
      applicantSent: applicantResult.status === 'fulfilled',
    });
  } catch (error) {
    return jsonResponse(500, { success: false, error: (error as Error)?.message ?? 'Unexpected error' });
  }
});
