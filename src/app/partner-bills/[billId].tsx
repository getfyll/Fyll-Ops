import React from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { PartnerBillDetail } from '@/components/PartnerBillDetail';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useThemeColors } from '@/lib/theme';
import useAuthStore from '@/lib/state/auth-store';

export default function PartnerBillDetailsScreen() {
  const router = useRouter();
  const { billId } = useLocalSearchParams<{ billId?: string | string[] }>();
  const colors = useThemeColors();
  const { isDesktop } = useBreakpoint();
  const resolvedBillId = Array.isArray(billId) ? billId[0] : billId;
  const isStaff = useAuthStore((s) => (s.currentUser?.role ?? 'staff') === 'staff');

  // Partner bills are for managers and admins only.
  React.useEffect(() => {
    if (isStaff) router.replace('/partners' as never);
  }, [isStaff, router]);
  if (isStaff) return null;

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/partners?partnerSection=bills' as never);
  };

  const body = (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <PartnerBillDetail billId={resolvedBillId} onClose={handleBack} />
    </SafeAreaView>
  );

  return isDesktop ? (
    <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg.primary }}>
      <DesktopSidebar />
      <View style={{ flex: 1 }}>{body}</View>
    </View>
  ) : body;
}
