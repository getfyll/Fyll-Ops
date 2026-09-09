import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type AnnouncementTestPayload = {
  email?: string;
  subject?: string;
  senderName?: string;
  replyToEmail?: string;
  title?: string;
  message?: string;
  footer?: string;
};

const sanitizeEnvValue = (value: string | undefined | null) => (
  (value ?? '')
    .normalize('NFKC')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
);

const APP_BASE_URL = sanitizeEnvValue(Deno.env.get('APP_BASE_URL'));
const FYLL_WORDMARK_URL = APP_BASE_URL
  ? new URL('/fyll-wordmark-email.png', APP_BASE_URL).toString()
  : '';

const jsonResponse = (status: number, body: Record<string, unknown>) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
};

const escapeHtml = (value: string) => {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const formatMessage = (value: string) => {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 16px;color:#4b5563;font-size:15px;line-height:24px;text-align:left;">${paragraph.replace(/\n/g, '<br>')}</p>`)
    .join('');
};

const isLikelyEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const buildAnnouncementHtml = ({
  senderName,
  title,
  message,
  footer,
}: Required<Pick<AnnouncementTestPayload, 'senderName' | 'title' | 'message' | 'footer'>>) => {
  const safeSender = escapeHtml(senderName);
  const safeTitle = escapeHtml(title);
  const safeFooter = footer.trim() ? escapeHtml(footer) : '';

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 0;">
      <tr>
        <td align="center" style="padding:0 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e5e7eb;border-radius:20px;overflow:hidden;">
            <tr>
              <td style="padding:32px;text-align:left;">
                <div style="font-size:16px;font-weight:700;letter-spacing:-0.1px;color:#111827;text-align:left;">${safeSender}</div>
                <div style="margin-top:32px;color:#9ca3af;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;text-align:left;">Announcement</div>
                <h1 style="margin:14px 0 16px;color:#111827;font-size:16px;line-height:22px;font-weight:700;letter-spacing:-0.1px;text-align:left;">${safeTitle}</h1>
                ${formatMessage(message)}
                <div style="border-top:1px solid #e5e7eb;margin-top:28px;padding-top:18px;text-align:left;">
                  ${safeFooter ? `<div style="color:#6b7280;font-size:12px;line-height:18px;text-align:left;">${safeFooter}</div>` : ''}
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px;">
                    <tr>
                      <td align="left" style="color:#9ca3af;font-size:11px;line-height:16px;">Powered by Fyll</td>
                      <td align="right">
                        ${FYLL_WORDMARK_URL
                          ? `<img src="${FYLL_WORDMARK_URL}" width="22" alt="Fyll" style="width:22px;max-width:22px;height:auto;display:inline-block;border:0;outline:none;text-decoration:none;" />`
                          : `<span style="color:#111827;font-size:12px;font-weight:700;letter-spacing:-0.2px;">Fyll</span>`
                        }
                      </td>
                    </tr>
                  </table>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL');

  if (!resendApiKey || !resendFromEmail) {
    return jsonResponse(500, { error: 'Email provider is not configured.' });
  }

  const payload = await req.json().catch(() => null) as AnnouncementTestPayload | null;
  const email = payload?.email?.trim().toLowerCase();
  const subject = payload?.subject?.trim();
  const senderName = payload?.senderName?.trim() || 'Fyll Team';
  const replyToEmail = payload?.replyToEmail?.trim().toLowerCase() || '';
  const title = payload?.title?.trim() || 'Announcement';
  const message = payload?.message?.trim();
  const footer = payload?.footer?.trim() || '';

  if (!email || !subject || !message) {
    return jsonResponse(400, { error: 'Missing email, subject, or message.' });
  }

  if (replyToEmail && !isLikelyEmail(replyToEmail)) {
    return jsonResponse(400, { error: 'Reply-to email is invalid.' });
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${senderName} <${resendFromEmail}>`,
      to: email,
      subject,
      reply_to: replyToEmail || undefined,
      html: buildAnnouncementHtml({ senderName, title, message, footer }),
    }),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const resendMessage = typeof data?.message === 'string' ? data.message : '';
    const senderDomainNotVerified = resendMessage.toLowerCase().includes('domain is not verified');

    return jsonResponse(senderDomainNotVerified ? 400 : 500, {
      error: senderDomainNotVerified
        ? 'Sender domain is not verified in Resend.'
        : 'Failed to send test email.',
      details: data,
    });
  }

  return jsonResponse(200, { success: true, data });
});
