import React from 'react';
import { View, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { OrderEditForm } from '@/components/OrderEditForm';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useThemeColors } from '@/lib/theme';
import { DesktopSidebar } from '@/components/DesktopSidebar';

export default function OrderEditScreen() {
  const router = useRouter();
  const { id, returnTo } = useLocalSearchParams<{ id: string; returnTo?: string | string[] }>();
  const orderId = typeof id === 'string' ? id : '';
  const returnTarget = Array.isArray(returnTo) ? returnTo[0] : returnTo;
  const shouldReturnToFinanceRevenue = returnTarget === 'finance-revenue';
  const { isDesktop } = useBreakpoint();
  const colors = useThemeColors();
  const isWebDesktop = Platform.OS === 'web' && isDesktop;
  const handleClose = () => {
    if (shouldReturnToFinanceRevenue) {
      router.replace('/finance?section=revenue' as any);
      return;
    }
    router.back();
  };

  if (isWebDesktop) {
    return (
      <View className="flex-1 flex-row" style={{ backgroundColor: colors.bg.primary }}>
        <DesktopSidebar />
        <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
          <OrderEditForm
            orderId={orderId}
            showHeader
            onClose={handleClose}
          />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: colors.bg.secondary }}>
      <OrderEditForm
        orderId={orderId}
        showHeader
        onClose={handleClose}
      />
    </SafeAreaView>
  );
}
