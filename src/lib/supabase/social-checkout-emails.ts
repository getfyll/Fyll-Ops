import { supabase } from '../supabase';

export type SocialCheckoutEmailType = 'payment_submitted' | 'payment_confirmed' | 'payment_rejected' | 'order_created';

type SocialCheckoutEmailPayload = {
  type: SocialCheckoutEmailType;
  businessId?: string | null;
  checkoutCode?: string | null;
  orderId?: string | null;
};

export const sendSocialCheckoutEmail = async ({
  type,
  businessId,
  checkoutCode,
  orderId,
}: SocialCheckoutEmailPayload) => {
  const normalizedBusinessId = businessId?.trim();
  const normalizedCheckoutCode = checkoutCode?.trim().toUpperCase();
  if (!normalizedBusinessId || !normalizedCheckoutCode) return;

  const { error } = await supabase.functions.invoke('send-social-checkout-email', {
    body: {
      type,
      businessId: normalizedBusinessId,
      checkoutCode: normalizedCheckoutCode,
      ...(orderId?.trim() ? { orderId: orderId.trim() } : {}),
    },
  });

  if (error) throw error;
};

export const queueSocialCheckoutEmail = (payload: SocialCheckoutEmailPayload) => {
  sendSocialCheckoutEmail(payload).catch((error) => {
    console.warn('Social checkout email failed:', error);
  });
};
