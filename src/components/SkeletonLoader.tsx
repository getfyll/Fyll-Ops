import React, { useEffect } from 'react';
import { View, Text, type DimensionValue } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useThemeColors } from '@/lib/theme';

export function SkeletonBox({ width, height, rounded = 'md' }: { width: number | string; height: number; rounded?: 'sm' | 'md' | 'lg' | 'xl' | 'full' }) {
  const themeColors = useThemeColors();
  const pulse = useSharedValue(0.45);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.78, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: pulse.value,
  }));

  const roundedClass = {
    sm: 'rounded',
    md: 'rounded-lg',
    lg: 'rounded-xl',
    xl: 'rounded-2xl',
    full: 'rounded-full',
  }[rounded];

  return (
    <Animated.View
      className={roundedClass}
      style={[{
        width: width as DimensionValue,
        height,
        backgroundColor: themeColors.border.light,
      }, animatedStyle]}
    />
  );
}

export function PaymentStatCardSkeleton({ isMobile = false }: { isMobile?: boolean }) {
  const themeColors = useThemeColors();

  return (
    <View
      className="rounded-[24px]"
      style={{
        flex: 1,
        minHeight: isMobile ? 104 : 138,
        paddingHorizontal: isMobile ? 14 : 18,
        paddingVertical: isMobile ? 12 : 18,
        backgroundColor: themeColors.bg.card,
        borderWidth: 1,
        borderColor: themeColors.border.light,
        justifyContent: 'center',
      }}
    >
      <SkeletonBox width="44%" height={10} rounded="md" />
      <View style={{ height: 12 }} />
      <SkeletonBox width="70%" height={isMobile ? 20 : 26} rounded="md" />
      <View style={{ height: 10 }} />
      <SkeletonBox width="86%" height={isMobile ? 10 : 12} rounded="md" />
    </View>
  );
}

export function PaymentRecordSkeleton({ isDesktop = false }: { isDesktop?: boolean }) {
  const themeColors = useThemeColors();

  if (isDesktop) {
    return (
      <View className="flex-row items-center px-5" style={{ height: 56, borderBottomWidth: 1, borderBottomColor: themeColors.border.light }}>
        <View style={{ flex: 1.25, minWidth: 145, paddingRight: 10 }}><SkeletonBox width="72%" height={14} rounded="md" /></View>
        <View style={{ flex: 0.95, minWidth: 100, paddingRight: 10 }}><SkeletonBox width="62%" height={14} rounded="md" /></View>
        <View style={{ flex: 1.45, minWidth: 180, paddingRight: 10 }}><SkeletonBox width="72%" height={14} rounded="md" /></View>
        <View style={{ flex: 0.9, minWidth: 105, paddingRight: 10 }}><SkeletonBox width="58%" height={14} rounded="md" /></View>
        <View style={{ flex: 1.05, minWidth: 130, paddingRight: 10 }}><SkeletonBox width={104} height={22} rounded="full" /></View>
        <View style={{ flex: 1.1, minWidth: 140, paddingRight: 10 }}><SkeletonBox width={88} height={22} rounded="full" /></View>
        <View style={{ flex: 0.85, minWidth: 96, paddingRight: 10 }}><SkeletonBox width={68} height={14} rounded="md" /></View>
        <View style={{ flex: 0.95, minWidth: 132, alignItems: 'flex-end' }}><SkeletonBox width={72} height={14} rounded="md" /></View>
      </View>
    );
  }

  return (
    <View className="rounded-2xl p-4 mb-2.5" style={{ backgroundColor: themeColors.bg.card, borderWidth: 1, borderColor: themeColors.border.light }}>
      <View className="flex-row items-start justify-between mb-3">
        <View style={{ flex: 1, marginRight: 12 }}>
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <SkeletonBox width="42%" height={14} rounded="md" />
            <SkeletonBox width={112} height={22} rounded="full" />
          </View>
          <View style={{ height: 9 }} />
          <SkeletonBox width="56%" height={12} rounded="md" />
          <View style={{ height: 8 }} />
          <SkeletonBox width="46%" height={12} rounded="md" />
        </View>
        <View style={{ alignItems: 'flex-end', width: 104 }}>
          <SkeletonBox width={86} height={18} rounded="md" />
          <View style={{ height: 9 }} />
          <SkeletonBox width={62} height={12} rounded="md" />
        </View>
      </View>
      <View className="flex-row items-center justify-between">
        <SkeletonBox width={82} height={22} rounded="full" />
        <SkeletonBox width={32} height={32} rounded="full" />
      </View>
    </View>
  );
}

export function PaymentListSkeleton({ isDesktop = false }: { isDesktop?: boolean }) {
  const themeColors = useThemeColors();

  return (
    <View>
      <View
        className="mx-5"
        style={{
          flexDirection: 'row',
          flexWrap: isDesktop ? 'nowrap' : 'wrap',
          marginHorizontal: isDesktop ? 20 : -5,
          marginBottom: isDesktop ? 20 : 0,
          gap: isDesktop ? 16 : 0,
        }}
      >
        {[0, 1, 2].map((index) => (
          <View
            key={`payment-stat-skeleton-${index}`}
            style={{
              width: isDesktop ? undefined : index === 2 ? '100%' : '50%',
              flex: isDesktop ? 1 : undefined,
              paddingHorizontal: isDesktop ? 0 : 5,
              marginBottom: isDesktop ? 0 : 12,
            }}
          >
            <PaymentStatCardSkeleton isMobile={!isDesktop} />
          </View>
        ))}
      </View>

      <View style={{ marginHorizontal: isDesktop ? 20 : 0, marginBottom: isDesktop ? 16 : 12 }}>
        <SkeletonBox width={isDesktop ? 320 : '100%'} height={44} rounded="full" />
      </View>

      {isDesktop ? (
        <View className="mx-5 rounded-2xl overflow-hidden" style={{ borderWidth: 1, borderColor: themeColors.border.light, backgroundColor: themeColors.bg.card }}>
          {[0, 1, 2, 3, 4, 5].map((index) => <PaymentRecordSkeleton key={`payment-row-skeleton-${index}`} isDesktop />)}
        </View>
      ) : (
        <View>
          {[0, 1, 2, 3, 4].map((index) => <PaymentRecordSkeleton key={`payment-card-skeleton-${index}`} />)}
        </View>
      )}
    </View>
  );
}

export function PaymentDetailSkeleton({ isDesktop = false }: { isDesktop?: boolean }) {
  const themeColors = useThemeColors();
  const sectionGap = isDesktop ? 16 : 12;

  return (
    <View>
      <View className="flex-row items-center flex-wrap" style={{ gap: 8, marginBottom: sectionGap }}>
        <SkeletonBox width={96} height={isDesktop ? 34 : 26} rounded="full" />
        <SkeletonBox width={118} height={isDesktop ? 34 : 26} rounded="full" />
      </View>
      <View style={{ flexDirection: isDesktop ? 'row' : 'column', gap: sectionGap, marginBottom: sectionGap }}>
        <View className="rounded-2xl p-5" style={{ flex: 1, minHeight: 236, backgroundColor: themeColors.bg.card, borderWidth: 1, borderColor: themeColors.border.light }}>
          <SkeletonBox width="35%" height={16} rounded="md" />
          <View style={{ height: 18 }} />
          <SkeletonBox width="46%" height={28} rounded="md" />
          <View style={{ height: 24 }} />
          <SkeletonBox width="62%" height={14} rounded="md" />
          <View style={{ height: 14 }} />
          <SkeletonBox width="52%" height={14} rounded="md" />
          <View style={{ height: 14 }} />
          <SkeletonBox width="68%" height={14} rounded="md" />
        </View>
        <View className="rounded-2xl p-5" style={{ width: isDesktop ? 420 : '100%', minHeight: 180, backgroundColor: themeColors.bg.card, borderWidth: 1, borderColor: themeColors.border.light }}>
          <SkeletonBox width="42%" height={16} rounded="md" />
          <View style={{ height: 18 }} />
          <SkeletonBox width="100%" height={96} rounded="xl" />
        </View>
      </View>
      {[0, 1, 2].map((index) => (
        <View key={`payment-detail-section-${index}`} className="rounded-2xl p-5" style={{ backgroundColor: themeColors.bg.card, borderWidth: 1, borderColor: themeColors.border.light, marginBottom: sectionGap }}>
          <SkeletonBox width="34%" height={16} rounded="md" />
          <View style={{ height: 16 }} />
          <SkeletonBox width="88%" height={14} rounded="md" />
          <View style={{ height: 12 }} />
          <SkeletonBox width="66%" height={14} rounded="md" />
        </View>
      ))}
    </View>
  );
}

export function ProductCardSkeleton() {
  const themeColors = useThemeColors();

  return (
    <View
      className="rounded-xl p-4 mb-3"
      style={{ backgroundColor: themeColors.bg.card, borderWidth: 1, borderColor: themeColors.border.light }}
    >
      <View className="flex-row items-center mb-3">
        <SkeletonBox width={48} height={48} rounded="lg" />
        <View className="flex-1 ml-3">
          <SkeletonBox width="70%" height={16} rounded="md" />
          <View className="h-2" />
          <SkeletonBox width="40%" height={12} rounded="md" />
        </View>
        <SkeletonBox width={48} height={24} rounded="full" />
      </View>

      <View className="flex-row items-center justify-between">
        <SkeletonBox width={80} height={14} rounded="md" />
        <SkeletonBox width={100} height={32} rounded="lg" />
      </View>
    </View>
  );
}

export function OrderCardSkeleton() {
  const themeColors = useThemeColors();

  return (
    <View
      className="rounded-xl p-4 mb-3"
      style={{ backgroundColor: themeColors.bg.card, borderWidth: 1, borderColor: themeColors.border.light }}
    >
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-1">
          <SkeletonBox width="50%" height={16} rounded="md" />
          <View className="h-2" />
          <SkeletonBox width="30%" height={12} rounded="md" />
        </View>
        <SkeletonBox width={80} height={24} rounded="full" />
      </View>

      <View className="flex-row items-center justify-between">
        <SkeletonBox width="40%" height={14} rounded="md" />
        <SkeletonBox width={100} height={20} rounded="md" />
      </View>
    </View>
  );
}

export function SyncingOverlay({ message = 'Syncing data...' }: { message?: string }) {
  const themeColors = useThemeColors();

  return (
    <View
      className="absolute inset-0 items-center justify-center"
      style={{
        backgroundColor: `${themeColors.bg.primary}ee`,
        zIndex: 1000,
      }}
    >
      <View className="items-center">
        <View className="mb-4">
          <SkeletonBox width={48} height={48} rounded="full" />
        </View>
        <Text style={{ color: themeColors.text.primary }} className="text-base font-semibold">
          {message}
        </Text>
        <Text style={{ color: themeColors.text.tertiary }} className="text-sm mt-1">
          Please wait...
        </Text>
      </View>
    </View>
  );
}
