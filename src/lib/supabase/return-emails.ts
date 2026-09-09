import { supabase } from '../supabase';

export type ReturnEmailType = 'return_received';

type ReturnEmailPayload = {
  type: ReturnEmailType;
  businessId?: string | null;
  returnId?: string | null;
};

export const sendReturnEmail = async ({
  type,
  businessId,
  returnId,
}: ReturnEmailPayload) => {
  const normalizedBusinessId = businessId?.trim();
  const normalizedReturnId = returnId?.trim();
  if (!normalizedBusinessId || !normalizedReturnId) return;

  const { error } = await supabase.functions.invoke('send-return-email', {
    body: {
      type,
      businessId: normalizedBusinessId,
      returnId: normalizedReturnId,
    },
  });

  if (error) throw error;
};

export const queueReturnEmail = (payload: ReturnEmailPayload) => {
  sendReturnEmail(payload).catch((error) => {
    console.warn('Return email failed:', error);
  });
};
