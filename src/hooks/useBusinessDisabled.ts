import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import useAuthStore from '@/lib/state/auth-store';

// A platform admin can disable a business from the Fyll console. This checks the signed-in
// business so everyone in it is stopped on a "This account has been disabled" screen.
// Re-checked every minute, so a disable takes effect without anyone signing out.
export function useBusinessDisabled() {
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isOfflineMode = useAuthStore((s) => s.isOfflineMode);

  const query = useQuery({
    queryKey: ['business-disabled', businessId],
    enabled: Boolean(businessId) && isAuthenticated && !isOfflineMode,
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data } = await supabase.from('businesses').select('data').eq('id', businessId!).maybeSingle();
      const businessData = (data?.data ?? {}) as { disabled?: unknown; disabledReason?: unknown };
      return {
        disabled: businessData.disabled === true,
        reason: typeof businessData.disabledReason === 'string' ? businessData.disabledReason : '',
      };
    },
  });

  return { isDisabled: query.data?.disabled === true, reason: query.data?.reason ?? '' };
}
