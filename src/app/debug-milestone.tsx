import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MilestoneCelebration } from '@/components/milestones/MilestoneCelebration';
import { MilestoneReplay } from '@/components/milestones/MilestoneReplay';
import { OnboardingChecklistCard, type OnboardingStep } from '@/components/home/OnboardingChecklistCard';
import { StorefrontCard } from '@/components/home/StorefrontCard';
import { NeedsYouCard, NeedsYouCarousel } from '@/components/home/NeedsYouToday';
import type { HomeNeed } from '@/lib/home-needs';
import { nextMilestone } from '@/lib/milestones';

// Preview of the order milestone celebration with fake numbers: /debug-milestone?m=1000&n=1012
export default function DebugMilestoneScreen() {
  const params = useLocalSearchParams<{ m?: string; n?: string; name?: string; store?: string; empty?: string; onboarding?: string; storefront?: string; needs?: string }>();
  const milestone = Number(params.m) > 0 ? Number(params.m) : 100;
  const total = Number(params.n) > 0 ? Number(params.n) : milestone + 8;
  const [open, setOpen] = useState(true);
  if (params.empty === '1') return <MilestoneReplay visible onClose={() => undefined} />;
  if (params.needs) {
    return <NeedsPreview carousel={params.needs === 'carousel'} />;
  }
  if (params.storefront) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20 }}>
        <StorefrontCard enabled={params.storefront === '1'} storefrontSlug="minteyewear" businessName="Mint Eyewear" onSetUp={() => undefined} />
      </SafeAreaView>
    );
  }
  if (params.onboarding) {
    const done = Math.min(8, Math.max(0, Number(params.onboarding) || 0));
    const labels = ['Add products', 'Add customers', 'Bank account', 'Team', 'First order', 'Business logo', 'Storefront', 'Notifications'];
    const steps: OnboardingStep[] = labels.map((label, index) => ({ id: label, title: `Set up: ${label}`, shortLabel: label, description: '', complete: index < done, actionLabel: 'Go', route: '/' }));
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center' }}>
        <OnboardingChecklistCard steps={steps} onDismiss={() => undefined} onStepPress={() => undefined} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#141414', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <Text style={{ color: '#f4f4ef', fontSize: 16 }}>Milestone preview ({milestone.toLocaleString('en-US')} orders)</Text>
      <Pressable onPress={() => setOpen(true)} style={{ height: 48, paddingHorizontal: 24, borderRadius: 999, backgroundColor: '#d5e057', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#1e1e1e', fontWeight: '700' }}>Play again</Text>
      </Pressable>
      <MilestoneCelebration
        visible={open}
        businessName={params.name ?? 'Mint Eyewear'}
        businessLogo={null}
        storefrontUrl={params.store === '0' ? null : 'minteyewear.fyll.store'}
        milestone={milestone}
        totalOrders={total}
        nextMilestone={nextMilestone(total)}
        onClose={() => setOpen(false)}
        onShared={() => undefined}
      />
    </SafeAreaView>
  );
}

const SAMPLE_NEEDS: HomeNeed[] = [
  { id: 'n1', tone: 'urgent', icon: 'card', title: '2 payments to review', body: 'Customers uploaded receipts.', cta: 'Review', route: '/payments' },
  { id: 'n2', tone: 'warn', icon: 'box', title: '1 order is overdue', body: 'It should have shipped yesterday.', cta: 'Open', route: '/orders' },
];

function NeedsPreview({ carousel }: { carousel: boolean }) {
  const [handled, setHandled] = useState<string[]>([]);
  const needs = SAMPLE_NEEDS.filter((need) => !handled.includes(need.id));
  const props = { needs, onAction: () => undefined, onDismiss: (id: string) => setHandled((current) => [...current, id]) };
  return (
    <SafeAreaView style={{ flex: 1, justifyContent: 'center', paddingHorizontal: carousel ? 0 : 20 }}>
      {carousel ? <NeedsYouCarousel {...props} /> : <NeedsYouCard {...props} />}
      <Text style={{ color: '#888', textAlign: 'center', marginTop: 24 }}>{needs.length === 0 ? 'PREVIEW: nothing left, card is gone' : `PREVIEW: ${needs.length} left`}</Text>
    </SafeAreaView>
  );
}
