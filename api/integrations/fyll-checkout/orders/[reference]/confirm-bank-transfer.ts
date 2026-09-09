import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FYLL_CHECKOUT_SHARED_SECRET = process.env.FYLL_CHECKOUT_SHARED_SECRET ?? process.env.SHARED_SECRET;
const FYLL_CHECKOUT_API_BASE_URL = (process.env.FYLL_CHECKOUT_API_BASE_URL ?? 'https://api.fyll.store').replace(/\/+$/, '');

const normalizeText = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !FYLL_CHECKOUT_SHARED_SECRET) {
    return res.status(500).json({ error: 'Fyll Checkout callback configuration missing' });
  }

  const reference = normalizeText(req.query.reference);
  const businessId = normalizeText((req.body as { businessId?: string } | undefined)?.businessId);
  const authHeader = Array.isArray(req.headers.authorization) ? req.headers.authorization[0] : req.headers.authorization;
  const accessToken = authHeader?.replace(/^Bearer\s+/i, '').trim() ?? '';
  if (!reference || !businessId || !accessToken) {
    return res.status(400).json({ error: 'reference, businessId, and auth token are required' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken);
  if (userError || !userData.user?.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const userId = userData.user.id;
  const { data: accessAllowed, error: accessError } = await supabase.rpc('can_user_connect_woocommerce_business', {
    user_id_input: userId,
    business_id_input: businessId,
  });
  if (accessError || accessAllowed !== true) {
    return res.status(403).json({ error: 'Business access denied' });
  }

  const callbackUrl = `${FYLL_CHECKOUT_API_BASE_URL}/api/orders/${encodeURIComponent(reference)}/fyll-app-payment-confirmed`;
  const callbackResponse = await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${FYLL_CHECKOUT_SHARED_SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ businessId, reference, confirmedByUserId: userId }),
  });

  if (!callbackResponse.ok) {
    const details = await callbackResponse.text().catch(() => '');
    return res.status(502).json({ error: 'Fyll Checkout callback failed', details });
  }

  return res.status(200).json({ success: true });
}
