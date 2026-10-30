import React, { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import useAuthStore from '@/lib/state/auth-store';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { buildStorefrontUrl } from '@/lib/storefront-url';
import {
  acknowledgeMilestones,
  fetchPendingMilestone,
  getPendingMilestoneQueryKey,
  markMilestoneShared,
  type PendingMilestone,
} from '@/lib/supabase/milestones';
import { MilestoneCelebration } from './MilestoneCelebration';

// Full-screen order milestone celebration, shown on Home to owners and admins the next time they open Fyll Ops
// after a milestone was reached. The server only returns a milestone to admins, and marks it as celebrated as soon
// as it is shown, so it appears once per milestone per business.
export function MilestoneGate() {
  const queryClient = useQueryClient();
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const userRole = useAuthStore((s) => s.currentUser?.role ?? 'staff');
  const { businessName, companyName, businessLogo, storefrontEnabled, storefrontSlug } = useBusinessSettings();
  const isAdmin = userRole === 'admin';

  const pendingQuery = useQuery({
    queryKey: getPendingMilestoneQueryKey(businessId),
    queryFn: () => fetchPendingMilestone(businessId!),
    enabled: Boolean(businessId) && isAdmin,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // Keep what is on screen even after the server marks it celebrated and the query refreshes.
  const [active, setActive] = useState<PendingMilestone | null>(null);
  const [dismissed, setDismissed] = useState<number | null>(null);
  useEffect(() => {
    const pending = pendingQuery.data;
    if (pending && !active && pending.milestone !== dismissed) setActive(pending);
  }, [pendingQuery.data, active, dismissed]);

  const acknowledge = useMutation({
    mutationFn: (milestone: number) => acknowledgeMilestones(businessId!, milestone),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: getPendingMilestoneQueryKey(businessId) });
    },
  });
  const share = useMutation({ mutationFn: (milestone: number) => markMilestoneShared(businessId!, milestone) });

  // Celebrated the moment it is first shown, so it never comes back, even if the app is closed straight away.
  const activeMilestone = active?.milestone ?? null;
  useEffect(() => {
    if (activeMilestone && businessId) acknowledge.mutate(activeMilestone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMilestone, businessId]);

  if (!active || !businessId || !isAdmin) return null;

  // Only a live storefront gets its address on the Story card, without the https:// part.
  const storefrontUrl = storefrontEnabled
    ? buildStorefrontUrl({ storefrontSlug, businessName, companyName }).replace(/^https?:\/\//, '')
    : null;

  return (
    <MilestoneCelebration
      visible
      businessName={(businessName || companyName || 'your business').trim()}
      businessLogo={businessLogo}
      storefrontUrl={storefrontUrl}
      milestone={active.milestone}
      totalOrders={active.totalOrders}
      nextMilestone={active.nextMilestone}
      onClose={() => {
        setDismissed(active.milestone);
        setActive(null);
      }}
      onShared={() => share.mutate(active.milestone)}
    />
  );
}
