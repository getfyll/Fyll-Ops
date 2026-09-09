import { supabase } from '@/lib/supabase';

export interface PartnerPortalJob {
  id: string;
  partnerId: string;
  orderId: string | null;
  orderNumber: string | null;
  customerName: string;
  imageUrl: string | null;
  itemLabel: string | null;
  jobType: string | null;
  jobService: string | null;
  documentUrl: string | null;
  documentName: string | null;
  documentMimeType: string | null;
  status: string;
  amount: number | null;
  notes: string | null;
  dispatchedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  readyAt: string | null;
  collectedAt: string | null;
  billedAt: string | null;
  billId: string | null;
  billStatus: 'pending' | 'approved' | 'rejected' | 'queried' | 'paid' | null;
  billSubmittedAt: string | null;
  billRespondedAt: string | null;
  billNote: string | null;
  billPaidAt: string | null;
  createdAt: string | null;
  hasOpenIssue: boolean;
  openIssueDescription: string | null;
}

export type PartnerBillingCycle = 'manual' | 'weekly' | 'biweekly' | 'monthly';

export interface PartnerPortalResult {
  partnerId: string;
  businessId: string;
  partnerName: string;
  businessName: string;
  email: string | null;
  partnerJobStatuses: string[];
  statusColors: Record<string, { bg: string; text: string }>;
  billingCycle: PartnerBillingCycle;
  isActive: boolean;
  jobs: PartnerPortalJob[];
}

export interface PartnerInvite {
  inviteCode: string;
  partnerId: string;
  businessId: string;
  email: string;
  partnerName: string;
  businessName: string;
}

const normalizeJob = (value: unknown): PartnerPortalJob | null => {
  if (!value || typeof value !== 'object') return null;
  const next = value as Record<string, unknown>;
  if (typeof next.id !== 'string') return null;
  return {
    id: next.id,
    partnerId: typeof next.partnerId === 'string' ? next.partnerId : '',
    orderId: typeof next.orderId === 'string' ? next.orderId : null,
    orderNumber: typeof next.orderNumber === 'string' && next.orderNumber ? next.orderNumber : null,
    customerName: typeof next.customerName === 'string' ? next.customerName : '',
    imageUrl: typeof next.imageUrl === 'string' ? next.imageUrl : null,
    itemLabel: typeof next.itemLabel === 'string' ? next.itemLabel : null,
    jobType: typeof next.jobType === 'string' ? next.jobType : null,
    jobService: typeof next.jobService === 'string' ? next.jobService : null,
    documentUrl: typeof next.documentUrl === 'string' ? next.documentUrl : null,
    documentName: typeof next.documentName === 'string' ? next.documentName : null,
    documentMimeType: typeof next.documentMimeType === 'string' ? next.documentMimeType : null,
    status: typeof next.status === 'string' ? next.status : 'awaiting_dispatch',
    amount: typeof next.amount === 'number' ? next.amount : null,
    notes: typeof next.notes === 'string' ? next.notes : null,
    dispatchedAt: typeof next.dispatchedAt === 'string' ? next.dispatchedAt : null,
    acceptedAt: typeof next.acceptedAt === 'string' ? next.acceptedAt : null,
    rejectedAt: typeof next.rejectedAt === 'string' && next.rejectedAt ? next.rejectedAt : null,
    readyAt: typeof next.readyAt === 'string' ? next.readyAt : null,
    collectedAt: typeof next.collectedAt === 'string' ? next.collectedAt : null,
    billedAt: typeof next.billedAt === 'string' ? next.billedAt : null,
    billId: typeof next.billId === 'string' && next.billId ? next.billId : null,
    billStatus: (['pending', 'approved', 'rejected', 'queried', 'paid'] as const).includes(next.billStatus as never)
      ? next.billStatus as PartnerPortalJob['billStatus']
      : null,
    billSubmittedAt: typeof next.billSubmittedAt === 'string' ? next.billSubmittedAt : null,
    billRespondedAt: typeof next.billRespondedAt === 'string' ? next.billRespondedAt : null,
    billNote: typeof next.billNote === 'string' && next.billNote ? next.billNote : null,
    billPaidAt: typeof next.billPaidAt === 'string' ? next.billPaidAt : null,
    createdAt: typeof next.createdAt === 'string' ? next.createdAt : null,
    hasOpenIssue: next.hasOpenIssue === true,
    openIssueDescription: typeof next.openIssueDescription === 'string' && next.openIssueDescription ? next.openIssueDescription : null,
  };
};

const normalizePortalResult = (value: unknown): PartnerPortalResult | null => {
  if (!value || typeof value !== 'object') return null;
  const next = value as Record<string, unknown>;
  if (typeof next.partnerId !== 'string' || typeof next.businessId !== 'string') return null;
  const jobs = Array.isArray(next.jobs)
    ? next.jobs.map(normalizeJob).filter((job): job is PartnerPortalJob => job !== null)
    : [];
  const partnerJobStatuses = Array.isArray(next.partnerJobStatuses)
    ? next.partnerJobStatuses.filter((status): status is string => typeof status === 'string')
    : [];
  const statusColors = next.statusColors && typeof next.statusColors === 'object'
    ? next.statusColors as Record<string, { bg: string; text: string }>
    : {};

  const billingCycle: PartnerBillingCycle = (['manual', 'weekly', 'biweekly', 'monthly'] as const).includes(next.billingCycle as never)
    ? next.billingCycle as PartnerBillingCycle
    : 'manual';

  return {
    partnerId: next.partnerId,
    businessId: next.businessId,
    partnerName: typeof next.partnerName === 'string' ? next.partnerName : 'Partner',
    businessName: typeof next.businessName === 'string' ? next.businessName : 'Business',
    email: typeof next.email === 'string' && next.email ? next.email : null,
    partnerJobStatuses,
    statusColors,
    billingCycle,
    isActive: next.isActive !== false,
    jobs,
  };
};

export const lookupPartnerPortal = async (token: string): Promise<PartnerPortalResult | null> => {
  const { data, error } = await supabase.rpc('lookup_partner_portal', { token_input: token });
  if (error) throw error;
  return normalizePortalResult(data);
};

export const lookupPartnerPortalByAuth = async (): Promise<PartnerPortalResult | null> => {
  const { data, error } = await supabase.rpc('lookup_partner_portal_by_auth');
  if (error) throw error;
  return normalizePortalResult(data);
};

export const getPartnerInvite = async (inviteCode: string): Promise<PartnerInvite | null> => {
  const { data, error } = await supabase.rpc('get_partner_invite', { invite_code_input: inviteCode });
  if (error) throw error;
  if (!data || typeof data !== 'object') return null;
  const next = data as Record<string, unknown>;
  if (typeof next.partnerId !== 'string' || typeof next.businessId !== 'string' || typeof next.email !== 'string') return null;
  return {
    inviteCode: typeof next.inviteCode === 'string' ? next.inviteCode : inviteCode,
    partnerId: next.partnerId,
    businessId: next.businessId,
    email: next.email,
    partnerName: typeof next.partnerName === 'string' ? next.partnerName : 'Partner',
    businessName: typeof next.businessName === 'string' ? next.businessName : 'Business',
  };
};

export const acceptPartnerInvite = async (inviteCode: string): Promise<{ partnerId: string; businessId: string } | null> => {
  const { data, error } = await supabase.rpc('accept_partner_invite', { invite_code_input: inviteCode });
  if (error) throw error;
  if (!data || typeof data !== 'object') return null;
  const next = data as Record<string, unknown>;
  if (typeof next.partnerId !== 'string' || typeof next.businessId !== 'string') return null;
  return { partnerId: next.partnerId, businessId: next.businessId };
};

export const updatePartnerPortalJobStatus = async ({
  token,
  jobId,
  status,
}: {
  token: string | null;
  jobId: string;
  status: string;
}) => {
  const { data, error } = await supabase.rpc('update_partner_portal_job_status', {
    token_input: token,
    job_id_input: jobId,
    status_input: status,
  });
  if (error) throw error;
  return data;
};

export const updatePartnerPortalJobFee = async ({
  token,
  jobId,
  amount,
}: {
  token: string | null;
  jobId: string;
  amount: number;
}) => {
  const { data, error } = await supabase.rpc('update_partner_portal_job_fee', {
    token_input: token,
    job_id_input: jobId,
    amount_input: amount,
  });
  if (error) throw error;
  return data;
};

export const submitPartnerBill = async (token: string | null, jobIds?: string[]): Promise<{ billId: string | null; total: number; jobCount: number }> => {
  const { data, error } = await supabase.rpc('submit_partner_bill', { token_input: token, job_ids_input: jobIds ?? null });
  if (error) throw error;
  const next = (data ?? {}) as Record<string, unknown>;
  return {
    billId: typeof next.billId === 'string' ? next.billId : null,
    total: typeof next.total === 'number' ? next.total : 0,
    jobCount: typeof next.jobCount === 'number' ? next.jobCount : 0,
  };
};

export const updatePartnerBillJobs = async (
  token: string | null,
  billId: string,
  jobIds: string[]
): Promise<{ billId: string | null; total: number; jobCount: number }> => {
  const { data, error } = await supabase.rpc('update_partner_bill_jobs', {
    token_input: token,
    bill_id_input: billId,
    job_ids_input: jobIds,
  });
  if (error) throw error;
  const next = (data ?? {}) as Record<string, unknown>;
  return {
    billId: typeof next.billId === 'string' ? next.billId : null,
    total: typeof next.total === 'number' ? next.total : 0,
    jobCount: typeof next.jobCount === 'number' ? next.jobCount : 0,
  };
};
