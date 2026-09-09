import { supabase } from '../supabase';
import {
  formatCompactBusinessUuid,
  getBusinessIdAliases,
  getCanonicalBusinessId,
} from '@/lib/business-id';

type WithId = { id: string };

type SupabaseRow<T> = {
  id: string;
  business_id: string;
  data: T;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

const getBusinessSettingsBusinessIds = (businessId: string) => {
  const aliases = getBusinessIdAliases(businessId);
  return aliases.length > 0 ? aliases : [businessId];
};

const getCanonicalBusinessSettingsBusinessId = (businessId: string) => {
  return getCanonicalBusinessId(businessId) || businessId;
};

const getTargetBusinessIds = (table: string, businessId: string) => (
  table === 'business_settings'
    ? getBusinessSettingsBusinessIds(businessId)
    : [businessId]
);

const getWriteTargetBusinessIds = (table: string, businessId: string) => (
  table === 'business_settings'
    ? [getCanonicalBusinessSettingsBusinessId(businessId)]
    : [businessId]
);

const fetchSettings = async <T>(table: string, businessId: string) => {
  const businessIds = getTargetBusinessIds(table, businessId);
  let query = supabase
    .from(table)
    .select('id, business_id, data, created_at, updated_at');

  query = businessIds.length === 1
    ? query.eq('business_id', businessIds[0])
    : query.in('business_id', businessIds);

  const { data, error } = await query;

  if (error) throw error;
  return (data ?? []) as SupabaseRow<T>[];
};

const upsertSettings = async <T extends WithId>(
  table: string,
  businessId: string,
  items: T[],
  createdBy?: string | null
) => {
  if (!items.length) return;
  const timestamp = new Date().toISOString();
  const businessIds = getWriteTargetBusinessIds(table, businessId);
  const rows = items.flatMap((item) => businessIds.map((targetBusinessId) => ({
    id: item.id,
    business_id: targetBusinessId,
    created_by: createdBy ?? null,
    data: item,
    updated_at: timestamp,
  })));

  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id,business_id' });
  if (error) throw error;
};

const deleteSettings = async (table: string, businessId: string, ids: string[]) => {
  if (!ids.length) return;
  const businessIds = getTargetBusinessIds(table, businessId);
  let query = supabase
    .from(table)
    .delete()
    .in('id', ids);

  query = businessIds.length === 1
    ? query.eq('business_id', businessIds[0])
    : query.in('business_id', businessIds);

  const { error } = await query;
  if (error) throw error;
};

export const supabaseSettings = {
  fetchSettings,
  upsertSettings,
  deleteSettings,
};
