import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { View } from 'react-native';
import { useThemeColors } from '@/lib/theme';
import { CaseDetailPanel } from '@/components/CaseDetailPanel';
import { DesktopSidebar } from '@/components/DesktopSidebar';
import { useBreakpoint } from '@/lib/useBreakpoint';

export default function CaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const router = useRouter();
  const { isDesktop } = useBreakpoint();

  const handleClose = () => {
    router.back();
  };

  const handleNavigateToOrder = (orderId: string) => {
    router.push(`/order/${orderId}`);
  };

  const content = (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
      <CaseDetailPanel
        caseId={id}
        onClose={handleClose}
        onNavigateToOrder={handleNavigateToOrder}
        showBackButton
      />
    </SafeAreaView>
  );

  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: colors.bg.primary }}>
        <DesktopSidebar />
        <View style={{ flex: 1 }}>{content}</View>
      </View>
    );
  }

  return content;
}
