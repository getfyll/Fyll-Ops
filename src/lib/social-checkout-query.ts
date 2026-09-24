import { getSocialCheckoutEffectiveStatus, type SocialCheckoutDraft } from '@/lib/state/fyll-store';
import { supabaseData } from '@/lib/supabase/data';

export const getSocialCheckoutQueryKey = (businessId: string | null) => (
  ['social-checkouts', businessId] as const
);

export const fetchSocialCheckoutDrafts = async (businessId: string): Promise<SocialCheckoutDraft[]> => {
  const rows = await supabaseData.fetchCollection<SocialCheckoutDraft>('social_checkouts', businessId);
  const drafts = rows.map((row) => row.data);
  const expiredDrafts = drafts
    .filter((draft) => draft.status === 'awaiting_payment' && getSocialCheckoutEffectiveStatus(draft) === 'expired')
    .map((draft) => ({
      ...draft,
      status: 'expired' as SocialCheckoutDraft['status'],
      updatedAt: new Date().toISOString(),
    }));

  if (expiredDrafts.length > 0) {
    await supabaseData.upsertCollection('social_checkouts', businessId, expiredDrafts);
  }

  const expiredById = new Map(expiredDrafts.map((draft) => [draft.id, draft] as const));
  return drafts.map((draft) => expiredById.get(draft.id) ?? draft);
};
