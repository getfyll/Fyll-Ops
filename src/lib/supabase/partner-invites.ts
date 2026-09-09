import { supabase } from '@/lib/supabase';

export interface PartnerInviteRecord {
  id: string;
  partnerId: string;
  businessId: string;
  email: string;
  inviteCode: string;
  status: 'pending' | 'joined';
  createdAt: string;
  joinedAt: string | null;
}

const generateInviteCode = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (length: number) => Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `PTNR-${pick(4)}-${pick(2)}`;
};

const normalizeInviteRow = (row: Record<string, unknown>): PartnerInviteRecord => ({
  id: String(row.id),
  partnerId: String(row.partner_id),
  businessId: String(row.business_id),
  email: String(row.email ?? ''),
  inviteCode: String(row.invite_code ?? ''),
  status: row.status === 'joined' ? 'joined' : 'pending',
  createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  joinedAt: typeof row.joined_at === 'string' ? row.joined_at : null,
});

export const createPartnerInvite = async (partnerId: string, businessId: string, email: string): Promise<PartnerInviteRecord> => {
  const inviteCode = generateInviteCode();
  const id = `pinv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const { data, error } = await supabase
    .from('partner_invites')
    .insert({
      id,
      partner_id: partnerId,
      business_id: businessId,
      email: email.trim().toLowerCase(),
      invite_code: inviteCode,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return normalizeInviteRow(data as Record<string, unknown>);
};

export const listPartnerInvites = async (businessId: string): Promise<PartnerInviteRecord[]> => {
  const { data, error } = await supabase
    .from('partner_invites')
    .select()
    .eq('business_id', businessId);

  if (error) throw error;
  return (data ?? []).map((row) => normalizeInviteRow(row as Record<string, unknown>));
};
