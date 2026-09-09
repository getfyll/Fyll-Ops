import { supabase } from '@/lib/supabase';

export const notifyFyllCheckoutPaymentConfirmed = async (input: {
  reference: string;
  businessId: string;
}) => {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error('Missing auth session for Fyll Checkout confirmation.');
  }

  const response = await fetch('/api/integrations/fyll-checkout/confirm-bank-transfer', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ businessId: input.businessId, reference: input.reference }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string; details?: string } | null;
    throw new Error(payload?.details || payload?.error || 'Fyll Checkout confirmation callback failed.');
  }
};
