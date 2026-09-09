import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type SendVipInvitePayload = {
  toEmail?: string;
  inviteCode?: string;
  role?: 'admin' | 'manager' | 'staff' | string;
  inviterName?: string;
  businessName?: string;
  joinLink?: string;
};

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL');

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing RESEND_API_KEY function secret' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!resendFromEmail) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing RESEND_FROM_EMAIL function secret' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = (await req.json()) as SendVipInvitePayload;
    const toEmail = body.toEmail?.trim().toLowerCase();
    const inviteCode = body.inviteCode?.trim().toUpperCase();
    const role = (body.role ?? 'staff').toString();
    const inviterName = body.inviterName?.trim() || 'An admin';
    const businessName = body.businessName?.trim() || 'Fyll';
    const joinLink = body.joinLink?.trim() || '';

    if (!toEmail || !toEmail.includes('@')) {
      return new Response(JSON.stringify({ success: false, error: 'Valid toEmail is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!inviteCode) {
      return new Response(JSON.stringify({ success: false, error: 'inviteCode is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const subject = `VIP Invite to ${businessName} on FYLL`;
    const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);

    const html = `
      <div style="font-family: Inter, Arial, sans-serif; background:#0b0b0d; color:#f7f7f7; padding:24px;">
        <div style="max-width:560px; margin:0 auto; background:#14161a; border:1px solid #23262d; border-radius:18px; padding:24px;">
          <p style="margin:0 0 8px; color:#f8d568; font-weight:600; letter-spacing:0.03em;">FYLL VIP ACCESS</p>
          <h1 style="margin:0 0 12px; font-size:24px; line-height:1.2;">You're invited to join ${businessName}</h1>
          <p style="margin:0 0 16px; color:#c7c9d1; line-height:1.5;">
            ${inviterName} invited you to join their FYLL workspace as <strong style="color:#ffffff;">${roleLabel}</strong>.
          </p>
          <div style="background:#0f1115; border:1px solid #2a2e37; border-radius:14px; padding:16px; margin:0 0 16px;">
            <p style="margin:0 0 6px; color:#9ca3af; font-size:12px;">Invite Code</p>
            <p style="margin:0; color:#ffffff; font-size:22px; font-weight:700; letter-spacing:0.14em;">${inviteCode}</p>
          </div>
          ${joinLink ? `<p style="margin:0 0 12px;"><a href="${joinLink}" style="display:inline-block; background:#f8d568; color:#111111; text-decoration:none; padding:12px 16px; border-radius:999px; font-weight:700;">Open FYLL Invite</a></p>` : ''}
          <p style="margin:0; color:#9ca3af; font-size:12px; line-height:1.5;">
            If the button doesn't open, use the invite code on the FYLL login screen under “Join With Invite Code”.
          </p>
        </div>
      </div>
    `;

    const text = [
      `FYLL VIP Invite to ${businessName}`,
      '',
      `${inviterName} invited you to join as ${roleLabel}.`,
      `Invite code: ${inviteCode}`,
      joinLink ? `Join link: ${joinLink}` : '',
      '',
      'Use the invite code on the FYLL login screen under “Join With Invite Code”.',
    ].filter(Boolean).join('\n');

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: [toEmail],
        subject,
        html,
        text,
      }),
    });

    const resendData = await resendResponse.json().catch(() => null);

    if (!resendResponse.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Resend API request failed',
          details: resendData,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(JSON.stringify({ success: true, data: resendData }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: (error as Error)?.message ?? 'Unexpected error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
