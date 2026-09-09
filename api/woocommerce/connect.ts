import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

type ConnectRequestBody = {
  storeUrl?: string;
  storeName?: string;
  adminEmail?: string;
  pluginVersion?: string;
  connectToken?: string;
  existingMerchantId?: string;
  existingPrivateKey?: string;
};

type ConsumedConnectToken = {
  token_id: string;
  business_id: string;
  store_url: string;
  store_name: string | null;
  admin_email: string | null;
  merchant_id: string | null;
  user_id: string;
};

const setCorsHeaders = (res: VercelResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const normalizeStoreUrl = (value: unknown) => (
  typeof value === 'string' ? value.trim().toLowerCase().replace(/\/+$/, '') : ''
);

const normalizeText = (value: unknown) => (
  typeof value === 'string' ? value.trim() : ''
);

const generateMerchantId = () => `MER-${randomBytes(5).toString('hex').toUpperCase()}`;
const generatePrivateKey = () => `fyll_sk_${randomBytes(32).toString('base64url')}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase service configuration missing' });
  }

  const body = (req.body ?? {}) as ConnectRequestBody;
  const storeUrl = normalizeStoreUrl(body.storeUrl);
  const storeName = normalizeText(body.storeName);
  const adminEmail = normalizeText(body.adminEmail).toLowerCase();
  const pluginVersion = normalizeText(body.pluginVersion);
  const connectToken = normalizeText(body.connectToken);
  const existingMerchantId = normalizeText(body.existingMerchantId);
  const existingPrivateKey = normalizeText(body.existingPrivateKey);

  if (!storeUrl || !connectToken) {
    return res.status(400).json({ error: 'storeUrl and connectToken are required' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  try {
    const { data: consumedRows, error: consumeError } = await supabase.rpc('consume_woocommerce_connect_token', {
      connect_token_input: connectToken,
      store_url_input: storeUrl,
      merchant_id_input: existingMerchantId || null,
    });

    if (consumeError) throw consumeError;

    const consumed = (Array.isArray(consumedRows) ? consumedRows[0] : consumedRows) as ConsumedConnectToken | undefined;
    if (!consumed?.business_id) {
      return res.status(401).json({ error: 'Invalid, expired, or already used connect token' });
    }

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id, data')
      .eq('id', consumed.business_id)
      .maybeSingle();

    if (businessError) throw businessError;
    if (!business?.id) {
      return res.status(404).json({ error: 'Connected Fyll business not found' });
    }

    const existingData = (business.data && typeof business.data === 'object' && !Array.isArray(business.data))
      ? business.data as Record<string, unknown>
      : {};
    const storedMerchantId = normalizeText(existingData.woocommerceMerchantId);
    const storedPrivateKey = normalizeText(existingData.woocommercePrivateKey);
    const merchantId = existingMerchantId || consumed.merchant_id || storedMerchantId || generateMerchantId();
    const privateKey = (
      existingMerchantId && existingMerchantId === merchantId && existingPrivateKey
        ? existingPrivateKey
        : storedPrivateKey || generatePrivateKey()
    );
    const now = new Date().toISOString();
    const nextBusinessData = {
      ...existingData,
      woocommerceEnabled: true,
      woocommerceStoreUrl: storeUrl,
      woocommerceStoreName: storeName || consumed.store_name || existingData.woocommerceStoreName || '',
      woocommerceAdminEmail: adminEmail || consumed.admin_email || existingData.woocommerceAdminEmail || '',
      woocommercePluginVersion: pluginVersion || existingData.woocommercePluginVersion || '',
      woocommerceMerchantId: merchantId,
      woocommercePrivateKey: privateKey,
      woocommerceConnectedByUserId: consumed.user_id,
      woocommerceConnectedAt: now,
      woocommerceLastConnectedAt: now,
    };

    const { error: updateError } = await supabase
      .from('businesses')
      .update({ data: nextBusinessData })
      .eq('id', consumed.business_id);

    if (updateError) throw updateError;

    return res.status(200).json({
      success: true,
      businessId: consumed.business_id,
      storeUrl,
      merchantId,
      privateKey,
    });
  } catch (error) {
    console.error('WooCommerce connect failed:', error);
    return res.status(500).json({
      error: 'WooCommerce connection failed',
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
