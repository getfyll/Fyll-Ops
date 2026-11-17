import { useRouter } from 'expo-router';
import { Banknote, FileText, Repeat, RotateCcw } from 'lucide-react-native';
import { isBusinessFeatureEnabled } from '@/lib/feature-access';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import type { FocusNavItem } from '@/components/FocusBottomNav';

export type CaseNavKey = 'cases' | 'returns' | 'replacements' | 'refunds';

// The small mobile nav shared by Cases, Returns, Replacements and Refunds.
export function useCaseNavItems(active: CaseNavKey): FocusNavItem[] {
  const router = useRouter();
  const { featureAccess } = useBusinessSettings();
  const returnsOn = isBusinessFeatureEnabled(featureAccess, 'returns');
  const go = (key: CaseNavKey, route: string) => () => {
    if (key !== active) router.navigate(route as never);
  };
  const items: (FocusNavItem | null)[] = [
    { key: 'cases', label: 'Cases', Icon: FileText, active: active === 'cases', onPress: go('cases', '/(tabs)/cases') },
    returnsOn ? { key: 'returns', label: 'Returns', Icon: RotateCcw, active: active === 'returns', onPress: go('returns', '/returns') } : null,
    { key: 'replacements', label: 'Replace', Icon: Repeat, active: active === 'replacements', onPress: go('replacements', '/replacements') },
    { key: 'refunds', label: 'Refunds', Icon: Banknote, active: active === 'refunds', onPress: go('refunds', '/case-refunds') },
  ];
  return items.filter((item): item is FocusNavItem => item !== null);
}
