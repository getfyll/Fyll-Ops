import { supabase } from '../supabase';

export interface PendingMilestone {
  milestone: number;
  totalOrders: number;
  nextMilestone: number;
}

export const getPendingMilestoneQueryKey = (businessId?: string | null) => ['pending-milestone', businessId ?? null];

// The highest milestone not yet celebrated. Only owners and admins get a row back; everyone else gets null.
const parsePendingMilestone = (data: unknown): PendingMilestone | null => {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object') return null;
  const record = row as Record<string, unknown>;
  const milestone = Number(record.milestone);
  if (!Number.isFinite(milestone) || milestone <= 0) return null;
  const totalOrders = Number(record.total_orders);
  const next = Number(record.next_milestone);
  return {
    milestone,
    totalOrders: Number.isFinite(totalOrders) ? totalOrders : milestone,
    nextMilestone: Number.isFinite(next) ? next : milestone,
  };
};

export const fetchPendingMilestone = async (businessId: string): Promise<PendingMilestone | null> => {
  const { data, error } = await supabase.rpc('get_pending_milestone', { business_id_input: businessId });
  if (error) throw error;
  return parsePendingMilestone(data);
};

// The highest milestone ever reached, whether or not it was celebrated. Read-only, used to replay it from Settings.
export const fetchLatestMilestone = async (businessId: string): Promise<PendingMilestone | null> => {
  const { data, error } = await supabase.rpc('get_latest_milestone', { business_id_input: businessId });
  if (error) throw error;
  return parsePendingMilestone(data);
};

// Marks this milestone and any lower ones as celebrated, so it is shown once per business.
export const acknowledgeMilestones = async (businessId: string, throughMilestone: number) => {
  const { error } = await supabase.rpc('acknowledge_milestones', {
    business_id_input: businessId,
    through_milestone: throughMilestone,
  });
  if (error) throw error;
};

export const markMilestoneShared = async (businessId: string, milestone: number) => {
  const { error } = await supabase.rpc('mark_milestone_shared', {
    business_id_input: businessId,
    milestone_input: milestone,
  });
  if (error) throw error;
};
