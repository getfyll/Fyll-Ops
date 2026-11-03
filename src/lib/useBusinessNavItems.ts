import { useRouter } from 'expo-router';
import { BarChart3, TrendingUp, Users } from 'lucide-react-native';
import useAuthStore, { ROLE_PERMISSIONS } from '@/lib/state/auth-store';
import { canShowFinanceNavigation } from '@/lib/finance-access';
import { isBusinessFeatureEnabled } from '@/lib/feature-access';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import type { FocusNavItem } from '@/components/FocusBottomNav';

export type BusinessNavKey = 'finance' | 'insights' | 'customers';

// The places in the small nav shared by Finance, Insights and Customers (and the pages inside them). Finance and
// Insights only appear for people who can open them.
export function useBusinessNavItems(active: BusinessNavKey | null): FocusNavItem[] {
  const router = useRouter();
  const role = useAuthStore((s) => s.currentUser?.role ?? 'staff');
  const { featureAccess } = useBusinessSettings();
  const canViewInsights = (ROLE_PERMISSIONS[role]?.canViewInsights ?? false) && isBusinessFeatureEnabled(featureAccess, 'insights');
  const canViewFinance = canShowFinanceNavigation(role) && isBusinessFeatureEnabled(featureAccess, 'finance');

  const items: (FocusNavItem | null)[] = [
    canViewFinance ? { key: 'finance', label: 'Finance', Icon: TrendingUp, active: active === 'finance', onPress: () => router.navigate('/(tabs)/finance' as never) } : null,
    canViewInsights ? { key: 'insights', label: 'Insights', Icon: BarChart3, active: active === 'insights', onPress: () => router.navigate('/(tabs)/insights' as never) } : null,
    { key: 'customers', label: 'Customers', Icon: Users, active: active === 'customers', onPress: () => router.navigate('/(tabs)/customers' as never) },
  ];
  return items.filter((item): item is FocusNavItem => item !== null);
}
