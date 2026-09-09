import { supabase } from '@/lib/supabase';

// Job categories and services are two independent flat lists, shared across
// all of a business's partners, stored on businesses.data so no new
// table/migration is needed. Services are NOT tied to a specific category —
// they're just a second grouping dimension (e.g. Category: Prescription,
// Non-Prescription; Service: Blue light, Photochromic, Antiglare).

const readList = (raw: unknown): string[] => (
  Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : []
);

export const getPartnerJobTaxonomy = async (businessId: string): Promise<{ categories: string[]; services: string[] }> => {
  const { data, error } = await supabase
    .from('businesses')
    .select('data')
    .eq('id', businessId)
    .single();

  if (error || !data) return { categories: [], services: [] };
  const blob = data.data as Record<string, unknown> | null;
  return {
    categories: readList(blob?.partnerJobCategories),
    services: readList(blob?.partnerJobServices),
  };
};

const saveField = async (businessId: string, field: 'partnerJobCategories' | 'partnerJobServices', values: string[]): Promise<void> => {
  const { data: existing, error: fetchError } = await supabase
    .from('businesses')
    .select('data')
    .eq('id', businessId)
    .single();

  if (fetchError) throw fetchError;

  const nextData = { ...(existing?.data as Record<string, unknown> | null ?? {}), [field]: values };
  const { error } = await supabase.from('businesses').update({ data: nextData }).eq('id', businessId);
  if (error) throw error;
};

export const savePartnerJobCategories = (businessId: string, categories: string[]) => (
  saveField(businessId, 'partnerJobCategories', categories)
);

export const savePartnerJobServices = (businessId: string, services: string[]) => (
  saveField(businessId, 'partnerJobServices', services)
);
