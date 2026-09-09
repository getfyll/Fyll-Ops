import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NOTIFY_TO_EMAIL = 'getfyll@gmail.com';

type SendInviteRequestPayload = {
  fullName?: string;
  email?: string;
  businessName?: string;
  message?: string;
  refundPolicy?: boolean;
  returnPolicy?: boolean;
  deliveryPolicy?: boolean;
  instagramHandle?: string;
};

const yesNo = (value?: boolean) => (value === undefined ? '' : value ? 'Yes' : 'No');

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

    const body = (await req.json()) as SendInviteRequestPayload;
    const fullName = body.fullName?.trim() || 'Someone';
    const email = body.email?.trim().toLowerCase();
    const businessName = body.businessName?.trim() || '';
    const message = body.message?.trim() || '';
    const refundPolicy = yesNo(body.refundPolicy);
    const returnPolicy = yesNo(body.returnPolicy);
    const deliveryPolicy = yesNo(body.deliveryPolicy);
    const instagramHandle = body.instagramHandle?.trim() || '';

    if (!email || !email.includes('@')) {
      return new Response(JSON.stringify({ success: false, error: 'Valid email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const subject = `New invitation request from ${fullName}${businessName ? ` (${businessName})` : ''}`;

    const html = `
      <div style="font-family: Inter, Arial, sans-serif; background:#0b0b0d; color:#f7f7f7; padding:24px;">
        <div style="max-width:560px; margin:0 auto; background:#14161a; border:1px solid #23262d; border-radius:18px; padding:24px;">
          <p style="margin:0 0 8px; color:#f8d568; font-weight:600; letter-spacing:0.03em;">FYLL ACCESS REQUEST</p>
          <h1 style="margin:0 0 12px; font-size:22px; line-height:1.2;">${fullName} wants access to FYLL</h1>
          <div style="background:#0f1115; border:1px solid #2a2e37; border-radius:14px; padding:16px; margin:0 0 16px;">
            <p style="margin:0 0 6px; color:#9ca3af; font-size:12px;">Email</p>
            <p style="margin:0 0 12px; color:#ffffff; font-size:16px; font-weight:600;">${email}</p>
            ${businessName ? `<p style="margin:0 0 6px; color:#9ca3af; font-size:12px;">Business</p><p style="margin:0 0 12px; color:#ffffff; font-size:16px; font-weight:600;">${businessName}</p>` : ''}
            ${instagramHandle ? `<p style="margin:0 0 6px; color:#9ca3af; font-size:12px;">Instagram</p><p style="margin:0 0 12px; color:#ffffff; font-size:16px; font-weight:600;">${instagramHandle}</p>` : ''}
            ${refundPolicy ? `<p style="margin:0 0 6px; color:#9ca3af; font-size:12px;">Refund Policy</p><p style="margin:0 0 12px; color:#e5e7eb; font-size:14px; line-height:1.5;">${refundPolicy}</p>` : ''}
            ${returnPolicy ? `<p style="margin:0 0 6px; color:#9ca3af; font-size:12px;">Return Policy</p><p style="margin:0 0 12px; color:#e5e7eb; font-size:14px; line-height:1.5;">${returnPolicy}</p>` : ''}
            ${deliveryPolicy ? `<p style="margin:0 0 6px; color:#9ca3af; font-size:12px;">Delivery Policy</p><p style="margin:0 0 12px; color:#e5e7eb; font-size:14px; line-height:1.5;">${deliveryPolicy}</p>` : ''}
            ${message ? `<p style="margin:0 0 6px; color:#9ca3af; font-size:12px;">Message</p><p style="margin:0; color:#e5e7eb; font-size:14px; line-height:1.5;">${message}</p>` : ''}
          </div>
          <p style="margin:0; color:#9ca3af; font-size:12px; line-height:1.5;">
            Sent from the "Request an Invitation" form on fyll.app.
          </p>
        </div>
      </div>
    `;

    const text = [
      `New FYLL access request from ${fullName}`,
      `Email: ${email}`,
      businessName ? `Business: ${businessName}` : '',
      instagramHandle ? `Instagram: ${instagramHandle}` : '',
      refundPolicy ? `Refund Policy: ${refundPolicy}` : '',
      returnPolicy ? `Return Policy: ${returnPolicy}` : '',
      deliveryPolicy ? `Delivery Policy: ${deliveryPolicy}` : '',
      message ? `Message: ${message}` : '',
    ].filter(Boolean).join('\n');

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: [NOTIFY_TO_EMAIL],
        reply_to: email,
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
