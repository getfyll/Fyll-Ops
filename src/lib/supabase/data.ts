import { supabase } from '../supabase';
type WithId = { id: string };

type SupabaseRow<T> = {
  id: string;
  business_id: string;
  data: T;
  created_at?: string | null;
  updated_at?: string | null;
};

const PAGE_SIZE = 1000;

const upsertCollection = async <T extends WithId>(
  table: string,
  businessId: string,
  items: T[]
) => {
  if (!items.length) return;
  const timestamp = new Date().toISOString();
  const rows = items.map((item) => ({
    id: item.id,
    business_id: businessId,
    data: item,
    updated_at: timestamp,
  }));

  const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id,business_id' });
  if (error) throw error;
};

const deleteByIds = async (table: string, businessId: string, ids: string[]) => {
  if (!ids.length) return;
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('business_id', businessId)
    .in('id', ids);
  if (error) throw error;
};

const fetchCollection = async <T>(
  table: string,
  businessId: string,
  options?: { orderBy?: string; limit?: number; updatedAfter?: string }
) => {
  const buildBaseQuery = () => {
    let query = supabase
      .from(table)
      .select('id, data, business_id')
      .eq('business_id', businessId);

    if (options?.updatedAfter) {
      query = query.gt('updated_at', options.updatedAfter);
    }

    if (options?.orderBy) {
      query = query.order(options.orderBy, { ascending: false });
      // Add deterministic tie-breaker for stable pagination.
      if (options.orderBy !== 'id') {
        query = query.order('id', { ascending: false });
      }
    }

    return query;
  };

  const requestedLimit = (
    typeof options?.limit === 'number' && Number.isFinite(options.limit) && options.limit > 0
      ? Math.floor(options.limit)
      : null
  );

  if (requestedLimit && requestedLimit <= PAGE_SIZE) {
    const { data, error } = await buildBaseQuery().limit(requestedLimit);
    if (error) throw error;
    return (data ?? []) as SupabaseRow<T>[];
  }

  const rows: SupabaseRow<T>[] = [];
  let offset = 0;

  while (true) {
    const remaining = requestedLimit ? (requestedLimit - rows.length) : PAGE_SIZE;
    if (requestedLimit && remaining <= 0) {
      break;
    }

    const batchSize = requestedLimit ? Math.min(PAGE_SIZE, remaining) : PAGE_SIZE;
    const { data, error } = await buildBaseQuery().range(offset, offset + batchSize - 1);
    if (error) throw error;

    const batch = (data ?? []) as SupabaseRow<T>[];
    if (batch.length === 0) {
      break;
    }

    rows.push(...batch);

    if (batch.length < batchSize) {
      break;
    }

    offset += batchSize;
  }

  return rows;
};

export const supabaseData = {
  fetchCollection,
  upsertCollection,
  deleteByIds,
};
