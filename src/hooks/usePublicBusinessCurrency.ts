import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { CURRENCY_CODES, setActiveCurrency, type CurrencyCode } from '@/lib/locale';

interface PublicCurrencyLookup {
  businessId?: string | null;
  businessSlug?: string | null;
  quoteCode?: string | null;
}

const toCurrency = (value: unknown): CurrencyCode | null => {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return (CURRENCY_CODES as string[]).includes(upper) ? (upper as CurrencyCode) : null;
};

/**
 * Customer-facing pages (tracking, quotes) are opened by people who aren't
 * signed in, so the business's currency never gets loaded the usual way.
 * This looks it up publicly and applies it, so formatCurrency() shows the
 * business's own symbol ($, £, ₦ …) instead of defaulting to Naira.
 */
export function usePublicBusinessCurrency({ businessId, businessSlug, quoteCode }: PublicCurrencyLookup) {
  const id = businessId?.trim() || null;
  const slug = businessSlug?.trim() || null;
  const quote = quoteCode?.trim() || null;

  const { data } = useQuery({
    queryKey: ['public-business-currency', id, slug, quote],
    enabled: Boolean(id || slug || quote),
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<CurrencyCode | null> => {
      const { data: code, error } = await supabase.rpc('get_public_business_currency', {
        business_id_input: id,
        business_slug_input: slug,
        quote_code_input: quote,
      });
      if (error) {
        console.warn('Could not load business currency:', error.message);
        return null;
      }
      return toCurrency(code);
    },
  });

  if (data) setActiveCurrency(data);
  return data ?? null;
}
