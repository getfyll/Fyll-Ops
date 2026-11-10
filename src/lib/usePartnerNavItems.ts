import { useMemo } from 'react';
import { useRouter } from 'expo-router';
import { AlertTriangle, Banknote, BarChart3, Briefcase, Building2 } from 'lucide-react-native';
import useAuthStore from '@/lib/state/auth-store';
import useFyllStore from '@/lib/state/fyll-store';
import type { FocusNavItem } from '@/components/FocusBottomNav';

export type PartnerNavKey = 'jobs' | 'bills' | 'issues' | 'all' | 'reports';

// The places in the small nav for Partners (and the pages inside it): Jobs, Bills, Issues, Partners, Reports.
// Bills are for managers and admins, so staff do not see that one.
export function usePartnerNavItems(active: PartnerNavKey | null): FocusNavItem[] {
  const router = useRouter();
  const canSeeBills = useAuthStore((s) => (s.currentUser?.role ?? 'staff') !== 'staff');
  const partnerJobIssues = useFyllStore((s) => s.partnerJobIssues);
  const partnerJobs = useFyllStore((s) => s.partnerJobs);
  const partners = useFyllStore((s) => s.partners);
  const openIssues = useMemo(() => partnerJobIssues.filter((issue) => issue.status === 'open').length, [partnerJobIssues]);
  // Bills waiting for review: one per bill (a bill covers several jobs), same rule as the Bills page ("Pending").
  const pendingBills = useMemo(() => {
    const partnerIds = new Set(partners.map((partner) => partner.id));
    const seen = new Set<string>();
    let count = 0;
    partnerJobs.forEach((job) => {
      if (!job.billId || seen.has(job.billId)) return;
      seen.add(job.billId);
      if (partnerIds.has(job.partnerId) && (job.billStatus ?? 'pending') === 'pending') count += 1;
    });
    return count;
  }, [partnerJobs, partners]);

  const go = (section: 'jobs' | 'bills' | 'issues' | 'all') => () => router.replace(`/partners?partnerSection=${section}` as never);

  const items: (FocusNavItem | null)[] = [
    { key: 'jobs', label: 'Jobs', Icon: Briefcase, active: active === 'jobs', onPress: go('jobs') },
    canSeeBills ? { key: 'bills', label: 'Bills', Icon: Banknote, active: active === 'bills', badge: pendingBills, onPress: go('bills') } : null,
    { key: 'issues', label: 'Issues', Icon: AlertTriangle, active: active === 'issues', badge: openIssues, onPress: go('issues') },
    { key: 'all', label: 'Partners', Icon: Building2, active: active === 'all', onPress: go('all') },
    { key: 'reports', label: 'Reports', Icon: BarChart3, active: active === 'reports', onPress: () => router.replace('/insights/partner-jobs' as never) },
  ];
  return items.filter((item): item is FocusNavItem => item !== null);
}
