import { useQuery } from '@tanstack/react-query';
import useAuthStore from '@/lib/state/auth-store';
import { supabaseData } from '@/lib/supabase/data';
import { newQuoteActivity, type Quote, type QuoteActivity } from '@/lib/quotes';

// Staff-side access to the `quotes` table. The customer never uses this: they go through the
// public RPCs in quote-public.ts.

export const quotesQueryKey = (businessId: string | null) => ['quotes', businessId] as const;

export const fetchQuotes = async (businessId: string): Promise<Quote[]> => {
  const rows = await supabaseData.fetchCollection<Quote>('quotes', businessId, { orderBy: 'updated_at' });
  return rows
    .map((row) => ({ ...row.data, id: row.data?.id ?? row.id, businessId }))
    .filter((quote) => Boolean(quote.quoteNumber));
};

export const saveQuote = async (businessId: string, quote: Quote) => {
  await supabaseData.upsertCollection('quotes', businessId, [{ ...quote, businessId, updatedAt: new Date().toISOString() }]);
};

// Applies a change and, if given, appends an activity line, then saves.
export const updateQuote = async (
  businessId: string,
  quote: Quote,
  patch: Partial<Quote>,
  activity?: { text: string; tone?: QuoteActivity['tone'] },
) => {
  const next: Quote = {
    ...quote,
    ...patch,
    activity: activity ? [...(quote.activity ?? []), newQuoteActivity(activity.text, activity.tone)] : quote.activity,
  };
  await saveQuote(businessId, next);
  return next;
};

export function useQuotes() {
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  return useQuery({
    queryKey: quotesQueryKey(businessId),
    enabled: Boolean(businessId),
    queryFn: () => fetchQuotes(businessId as string),
    refetchInterval: 30000,
  });
}
