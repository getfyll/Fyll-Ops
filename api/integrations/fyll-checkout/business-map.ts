import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INTEGRATION_SECRET = process.env.FYLL_CHECKOUT_INTEGRATION_SECRET ?? process.env.SERVER_SECRET;

const normalizeStoreUrl = (value: unknown) => (
  typeof value === 'string' ? value.trim().toLowerCase().replace(/\/+$/, '') : ''
);

const normalizeText = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const LEGACY_BUSINESS_MAPPINGS: Record<string, { businessId: string; merchantId: string; storeUrl: string }> = {
  'MER-EC8AD9A5|https://minteyewear.co': {
    businessId: 'biz-2e38ebb3f2dc4d00bd812b05afc1cbf2',
    merchantId: 'MER-EC8AD9A5',
    storeUrl: 'https://minteyewear.co',
  },
};

const findLegacyBusinessMapping = (merchantId: string, storeUrl: string) => (
  LEGACY_BUSINESS_MAPPINGS[`${merchantId}|${storeUrl}`] ?? null
);

const isAuthorized = (req: VercelRequest) => {
  const authorization = req.headers.authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  return Boolean(INTEGRATION_SECRET && value === `Bearer ${INTEGRATION_SECRET}`);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase service configuration missing' });
  }

  const merchantId = normalizeText(req.query.merchantId);
  const storeUrl = normalizeStoreUrl(req.query.storeUrl);
  if (!merchantId && !storeUrl) {
    return res.status(400).json({ error: 'merchantId or storeUrl is required' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let query = supabase.from('businesses').select('id, data').limit(1);
  if (merchantId) {
    query = query.eq('data->>woocommerceMerchantId', merchantId);
  }
  if (storeUrl) {
    query = query.eq('data->>woocommerceStoreUrl', storeUrl);
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    return res.status(500).json({ error: 'Business lookup failed', details: error.message });
  }
  if (!data?.id) {
    const legacyMapping = findLegacyBusinessMapping(merchantId, storeUrl);
    if (legacyMapping) {
      return res.status(200).json(legacyMapping);
    }

    return res.status(404).json({ error: 'Business mapping not found' });
  }

  const businessData = (data.data && typeof data.data === 'object' && !Array.isArray(data.data))
    ? data.data as Record<string, unknown>
    : {};

  return res.status(200).json({
    businessId: data.id,
    merchantId: normalizeText(businessData.woocommerceMerchantId) || merchantId,
    storeUrl: normalizeStoreUrl(businessData.woocommerceStoreUrl) || storeUrl,
  });
}
