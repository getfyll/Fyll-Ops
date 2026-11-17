import { supabase } from '../supabase';
import useFyllStore, { type Case } from '../state/fyll-store';

// Customer emails about a case. Only the customer-facing summary and resolution are sent (never staff notes,
// priority or comments). Every email that goes out is logged on the case and in its timeline.
export type CaseEmailType = 'case_opened' | 'replacement_sent' | 'refund' | 'credit' | 'resolved';

export const CASE_EMAIL_LABELS: Record<CaseEmailType, string> = {
  case_opened: 'Case opened',
  replacement_sent: 'Replacement on its way',
  refund: 'Refund approved',
  credit: 'Credit added',
  resolved: 'Case resolved',
};

/** Which resolution email a resolution type sends. Replacement Sent has its own email when the order is created. */
export const caseEmailTypeForResolution = (resolutionType: string): CaseEmailType | null => {
  const value = resolutionType.trim().toLowerCase();
  if (value.includes('replacement')) return null;
  if (value.includes('refund')) return 'refund';
  if (value.includes('credit')) return 'credit';
  return 'resolved';
};

export const isCaseEmailOn = (caseItem: Pick<Case, 'emailCustomer'>) => caseItem.emailCustomer !== false;

/** The customer's email for a case: from the linked order, else the customer record. */
export const getCaseCustomerEmail = (caseItem: Pick<Case, 'orderId' | 'customerId'>): string => {
  const state = useFyllStore.getState();
  const order = caseItem.orderId ? state.orders.find((o) => o.id === caseItem.orderId) : undefined;
  const fromOrder = order?.customerEmail?.trim();
  if (fromOrder) return fromOrder;
  const customer = caseItem.customerId ? state.customers.find((c) => c.id === caseItem.customerId) : undefined;
  return customer?.email?.trim() ?? '';
};

export async function sendCaseEmail({
  caseId,
  type,
  businessId,
  staffName,
  message,
  replacementOrderId,
  replacementOrderNumber,
  amount,
}: {
  caseId: string;
  type: CaseEmailType;
  businessId: string | null;
  staffName: string;
  message?: string;
  replacementOrderId?: string;
  replacementOrderNumber?: string;
  amount?: number;
}): Promise<{ sent: boolean; to?: string; reason?: string }> {
  if (!businessId) throw new Error('No business selected.');
  const { data, error } = await supabase.functions.invoke('send-case-email', {
    body: { type, businessId, caseId, message: message?.trim() || undefined, replacementOrderId, amount },
  });
  if (error) throw error;
  const result = (data ?? {}) as { sent?: boolean; to?: string; reason?: string };
  if (!result.sent) {
    return { sent: false, reason: result.reason === 'missing-customer-email' ? 'This customer has no email address.' : result.reason };
  }

  // Log it on the latest copy of the case.
  const store = useFyllStore.getState();
  const current = store.cases.find((c) => c.id === caseId);
  if (current) {
    const now = new Date().toISOString();
    const label = CASE_EMAIL_LABELS[type];
    await store.updateCase(caseId, {
      customerEmails: [
        ...(current.customerEmails ?? []),
        { type, sentAt: now, to: result.to, sentBy: staffName, ref: replacementOrderNumber },
      ],
      timeline: [
        { id: Math.random().toString(36).slice(2), date: now, action: `Emailed customer: ${label}${result.to ? ` (${result.to})` : ''}`, user: staffName },
        ...(current.timeline ?? []),
      ],
    }, businessId);
  }
  return { sent: true, to: result.to };
}
