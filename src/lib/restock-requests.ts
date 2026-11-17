import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from './supabase';

// A team list of things to buy next. No customer details: just what, how many, who asked and why.
// Asking again for something already open adds to that request instead of making a new line.

export type RestockRequestStatus = 'requested' | 'ordered' | 'received' | 'declined';

export interface RestockRequestAsk {
  by: string;
  at: string;
  quantity?: number;
  note?: string;
}

export interface RestockRequest {
  id: string;
  productId?: string;
  variantId?: string;
  itemName: string;
  variantLabel?: string;
  status: RestockRequestStatus;
  asks: RestockRequestAsk[];
  statusNote?: string;
  statusChangedAt?: string;
  statusChangedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export const RESTOCK_STATUS_LABELS: Record<RestockRequestStatus, string> = {
  requested: 'Requested',
  ordered: 'Ordered',
  received: 'Received',
  declined: 'Declined',
};

export const isRestockRequestOpen = (request: Pick<RestockRequest, 'status'>) => (
  request.status === 'requested' || request.status === 'ordered'
);

export const totalRequestedQuantity = (request: Pick<RestockRequest, 'asks'>) => (
  request.asks.reduce((sum, ask) => sum + (ask.quantity && ask.quantity > 0 ? ask.quantity : 0), 0)
);

export const uniqueRequesters = (request: Pick<RestockRequest, 'asks'>) => (
  Array.from(new Set(request.asks.map((ask) => ask.by.trim()).filter(Boolean)))
);

const normalizeName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

/** The open request a new ask should stack onto: same product + variant, or same typed name for new items. */
export const findMatchingOpenRequest = (
  requests: RestockRequest[],
  item: { productId?: string; variantId?: string; itemName: string },
): RestockRequest | undefined => requests.find((request) => {
  if (!isRestockRequestOpen(request)) return false;
  if (item.productId) return request.productId === item.productId && (request.variantId ?? '') === (item.variantId ?? '');
  return !request.productId && normalizeName(request.itemName) === normalizeName(item.itemName);
});

/** Open first (most asks first), then closed by most recent change. */
export const sortRestockRequests = (requests: RestockRequest[]) => [...requests].sort((a, b) => {
  const openDiff = Number(isRestockRequestOpen(b)) - Number(isRestockRequestOpen(a));
  if (openDiff !== 0) return openDiff;
  if (isRestockRequestOpen(a)) {
    const askDiff = b.asks.length - a.asks.length;
    if (askDiff !== 0) return askDiff;
  }
  return b.updatedAt.localeCompare(a.updatedAt);
});

const TABLE = 'restock_requests';
const queryKey = (businessId: string | null | undefined) => ['restock-requests', businessId ?? 'none'];

async function fetchRestockRequests(businessId: string): Promise<RestockRequest[]> {
  const { data, error } = await supabase.from(TABLE).select('data').eq('business_id', businessId);
  if (error) throw error;
  return (data ?? []).map((row) => row.data as RestockRequest);
}

async function saveRestockRequest(businessId: string, request: RestockRequest) {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ id: request.id, business_id: businessId, data: request, updated_at: new Date().toISOString() }, { onConflict: 'id,business_id' });
  if (error) throw error;
}

export function useRestockRequests(businessId: string | null | undefined) {
  return useQuery({
    queryKey: queryKey(businessId),
    queryFn: () => fetchRestockRequests(businessId as string),
    enabled: Boolean(businessId),
    refetchInterval: 60_000,
  });
}

export interface NewRestockAsk {
  productId?: string;
  variantId?: string;
  itemName: string;
  variantLabel?: string;
  quantity?: number;
  note?: string;
  by: string;
}

export function useRestockRequestActions(businessId: string | null | undefined) {
  const queryClient = useQueryClient();
  const key = queryKey(businessId);

  const commit = async (request: RestockRequest) => {
    if (!businessId) throw new Error('No business selected');
    await saveRestockRequest(businessId, request);
    queryClient.setQueryData<RestockRequest[]>(key, (previous) => {
      const list = previous ?? [];
      return list.some((item) => item.id === request.id)
        ? list.map((item) => (item.id === request.id ? request : item))
        : [...list, request];
    });
    return request;
  };

  // Saves one or more asks together. Each stacks onto a matching open request, if there is one.
  const addAsks = useMutation({
    mutationFn: async (inputs: NewRestockAsk[]) => {
      if (!businessId) throw new Error('No business selected');
      // Re-read so two teammates asking at once stack instead of duplicating.
      const working = await fetchRestockRequests(businessId);
      const touched = new Map<string, RestockRequest>();
      let stackedCount = 0;
      inputs.forEach((input, index) => {
        const now = new Date().toISOString();
        const ask: RestockRequestAsk = {
          by: input.by,
          at: now,
          ...(input.quantity && input.quantity > 0 ? { quantity: input.quantity } : {}),
          ...(input.note?.trim() ? { note: input.note.trim() } : {}),
        };
        const existing = findMatchingOpenRequest(working, input);
        const request: RestockRequest = existing
          ? { ...existing, asks: [ask, ...existing.asks], updatedAt: now }
          : {
            id: `rr-${Date.now().toString(36)}${index}${Math.random().toString(36).slice(2, 8)}`,
            ...(input.productId ? { productId: input.productId } : {}),
            ...(input.variantId ? { variantId: input.variantId } : {}),
            itemName: input.itemName.trim(),
            ...(input.variantLabel ? { variantLabel: input.variantLabel } : {}),
            status: 'requested',
            asks: [ask],
            createdAt: now,
            updatedAt: now,
          };
        if (existing) stackedCount += 1;
        const at = working.findIndex((item) => item.id === request.id);
        if (at >= 0) working[at] = request; else working.push(request);
        touched.set(request.id, request);
      });
      const rows = Array.from(touched.values());
      const { error } = await supabase
        .from(TABLE)
        .upsert(rows.map((request) => ({ id: request.id, business_id: businessId, data: request, updated_at: new Date().toISOString() })), { onConflict: 'id,business_id' });
      if (error) throw error;
      queryClient.setQueryData<RestockRequest[]>(key, working);
      return { count: inputs.length, stackedCount };
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const setStatus = useMutation({
    mutationFn: async ({ request, status, by, note }: { request: RestockRequest; status: RestockRequestStatus; by: string; note?: string }) => {
      const now = new Date().toISOString();
      return commit({
        ...request,
        status,
        statusChangedAt: now,
        statusChangedBy: by,
        statusNote: note?.trim() || undefined,
        updatedAt: now,
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const remove = useMutation({
    mutationFn: async (request: RestockRequest) => {
      if (!businessId) throw new Error('No business selected');
      const { error } = await supabase.from(TABLE).delete().eq('id', request.id).eq('business_id', businessId);
      if (error) throw error;
      queryClient.setQueryData<RestockRequest[]>(key, (previous) => (previous ?? []).filter((item) => item.id !== request.id));
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return { addAsks, setStatus, remove };
}
