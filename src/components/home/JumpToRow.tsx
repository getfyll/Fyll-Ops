import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { BarChart3, DollarSign, FileText, Truck, Wallet } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

export type JumpToItem = {
  key: string;
  label: string;
  route: string;
  Icon: LucideIcon;
  badge?: number;
  sub?: string;
};

export const buildJumpToItems = ({
  canUseCases,
  canUseSocialCheckout,
  canUseFinance,
  canUseInsights,
  isAdmin,
  isManagerOrAdmin,
  openCasesCount,
  pendingPaymentCount,
  financeBadgeCount,
  activePartnerJobsCount,
}: {
  canUseCases: boolean;
  canUseSocialCheckout: boolean;
  canUseFinance: boolean;
  canUseInsights: boolean;
  isAdmin: boolean;
  isManagerOrAdmin: boolean;
  openCasesCount: number;
  pendingPaymentCount: number;
  financeBadgeCount: number;
  activePartnerJobsCount: number;
}): JumpToItem[] => {
  const items: (JumpToItem | null)[] = [
  canUseCases ? { key: 'cases', label: 'Cases', route: '/cases', Icon: FileText, badge: openCasesCount, sub: openCasesCount > 0 ? `${openCasesCount} open` : 'Customer cases' } : null,
  canUseSocialCheckout ? { key: 'payments', label: 'Payments', route: '/payments', Icon: Wallet, badge: pendingPaymentCount, sub: pendingPaymentCount > 0 ? `${pendingPaymentCount} to review` : 'Social checkout' } : null,
  isManagerOrAdmin && canUseFinance ? { key: 'finance', label: 'Finance', route: '/(tabs)/finance', Icon: DollarSign, badge: financeBadgeCount, sub: isAdmin ? `${financeBadgeCount} requests pending` : 'Expenses & procurement' } : null,
  isAdmin && canUseInsights ? { key: 'insights', label: 'Insights', route: '/(tabs)/insights', Icon: BarChart3, sub: 'Sales & trends' } : null,
  { key: 'partner-jobs', label: 'Partner jobs', route: '/partners?partnerSection=jobs', Icon: Truck, badge: activePartnerJobsCount, sub: activePartnerJobsCount > 0 ? `${activePartnerJobsCount} active ${activePartnerJobsCount === 1 ? 'job' : 'jobs'}` : 'No active jobs' },
  ];
  return items.filter((item): item is JumpToItem => item !== null);
};

// One thin row of shortcuts to the main screens, above the stat cards.
export function JumpToRow({ items, onPress }: { items: JumpToItem[]; onPress: (route: string) => void }) {
  const palette = usePaymentsPalette();
  if (items.length === 0) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ alignItems: 'center', gap: 10 }}>
      <Text style={{ color: palette.muted, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase', marginRight: 6 }}>Jump to</Text>
      {items.map(({ key, label, route, Icon, badge }) => (
        <Pressable
          key={key}
          onPress={() => onPress(route)}
          accessibilityRole="link"
          style={(state) => ({
            height: 38,
            paddingHorizontal: 14,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: isHovered(state) ? palette.outline : palette.border,
            backgroundColor: palette.card,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            opacity: state.pressed ? 0.8 : 1,
          })}
        >
          <Icon size={15} color={palette.textSoft} strokeWidth={2} />
          <Text style={{ color: palette.textSoft, fontSize: 12, fontWeight: '600' }}>{label}</Text>
          {badge && badge > 0 ? (
            <View
              style={{
                minWidth: 20,
                height: 20,
                paddingHorizontal: 6,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: palette.nudgeBg,
              }}
            >
              <Text style={{ color: palette.limeOnSurface, fontSize: 12, fontWeight: '700' }}>{badge > 99 ? '99+' : badge}</Text>
            </View>
          ) : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}

// Mobile: the same shortcuts as a two-column grid of cards.
export function JumpToGrid({ items, onPress }: { items: JumpToItem[]; onPress: (route: string) => void }) {
  const palette = usePaymentsPalette();
  if (items.length === 0) return null;

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
      {items.map(({ key, label, route, Icon, badge, sub }, index) => {
        const isLastOdd = items.length % 2 === 1 && index === items.length - 1;
        return (
          <Pressable
            key={key}
            onPress={() => onPress(route)}
            accessibilityRole="link"
            className="active:opacity-80"
            style={{
              flexGrow: 1,
              flexBasis: isLastOdd ? '100%' : '45%',
              minWidth: 0,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              borderRadius: 18,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.card,
            }}
          >
            <View style={{ width: 36, height: 36, borderRadius: 11, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={18} color={palette.textSoft} strokeWidth={2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{label}</Text>
              {sub ? <Text style={{ color: palette.faint, fontSize: 12 }} numberOfLines={1}>{sub}</Text> : null}
            </View>
            {badge && badge > 0 ? (
              <View style={{ minWidth: 20, height: 20, paddingHorizontal: 6, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
                <Text style={{ color: palette.limeOnSurface, fontSize: 12, fontWeight: '700' }}>{badge > 99 ? '99+' : badge}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
