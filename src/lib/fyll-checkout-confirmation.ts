import { Alert, Platform } from 'react-native';
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

// The payment is already approved in Ops when this runs; if WooCommerce
// couldn't be told, staff need to know so they can update it by hand rather
// than finding out from the customer.
export const showFyllCheckoutSyncFailedNotice = (reference: string, error: unknown) => {
  const reason = error instanceof Error && error.message ? error.message : 'Unknown error';
  const title = 'Approved in Fyll — website not updated';
  const message = `Payment ${reference} is approved here, but your website order couldn't be moved to Processing automatically (${reason}). Please update it in WooCommerce.`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
};
