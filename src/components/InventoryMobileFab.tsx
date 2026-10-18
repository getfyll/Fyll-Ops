import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Box, Briefcase, Check, ClipboardCheck, Menu, Package, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '@/lib/theme';
import { useTabBarHeight } from '@/lib/useTabBarHeight';
import { FYLL_LIME, FYLL_LIME_INK, usePaymentsPalette } from '@/components/payments/payments-ui';

type InventorySection = 'products' | 'services' | 'warehouse';
type InventoryMenuOption = InventorySection | 'audit';

type InventoryMobileFabProps = {
  currentSection: InventorySection;
  visible?: boolean;
  lowerBy?: number;
  onSelectProducts?: () => void;
  onSelectServices?: () => void;
  onSelectWarehouse?: () => void;
};

export function InventoryMobileFab({
  currentSection,
  visible = true,
  lowerBy = 0,
  onSelectProducts,
  onSelectServices,
  onSelectWarehouse,
}: InventoryMobileFabProps) {
  const router = useRouter();
  const colors = useThemeColors();
  const palette = usePaymentsPalette();
  const tabBarHeight = useTabBarHeight();
  const [open, setOpen] = useState(false);
  const fabBottom = Math.max(12, tabBarHeight - 30 - lowerBy);
  const menuBottom = fabBottom + 70;

  const options = useMemo(
    () => [
      { key: 'products' as const, label: 'Products', icon: Package },
      { key: 'services' as const, label: 'Services', icon: Briefcase },
      { key: 'warehouse' as const, label: 'Warehouse', icon: Box },
      { key: 'audit' as const, label: 'Audit', icon: ClipboardCheck },
    ],
    []
  );

  if (!visible) return null;

  const handleSelect = (section: InventoryMenuOption) => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setOpen(false);

    if (section === currentSection) return;

    if (section === 'audit') {
      router.push('/inventory-audit');
      return;
    }

    if (section === 'products') {
      if (onSelectProducts) {
        onSelectProducts();
        return;
      }
      router.push('/inventory');
      return;
    }

    if (section === 'services') {
      if (onSelectServices) {
        onSelectServices();
        return;
      }
      router.push('/services');
      return;
    }

    if (onSelectWarehouse) {
      onSelectWarehouse();
      return;
    }
    router.push('/inventory/warehouse');
  };

  const activeLabel = options.find((option) => option.key === currentSection)?.label ?? 'Products';

  return (
    <>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(17,17,17,0.24)' }}
          onPress={() => setOpen(false)}
        >
          <View
            style={{
              position: 'absolute',
              right: 16,
              bottom: menuBottom,
              width: 288,
              maxHeight: '78%',
              borderRadius: 24,
              borderWidth: 1,
              borderColor: palette.border,
              backgroundColor: palette.card,
              overflow: 'hidden',
            }}
          >
            <Pressable onPress={(event) => event.stopPropagation()}>
              <View style={{ minHeight: 70, paddingHorizontal: 16, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
                <View style={{ minWidth: 0 }}>
                  <Text style={{ color: palette.text, fontSize: 14, fontWeight: '500' }}>Inventory</Text>
                  <Text style={{ color: palette.faint, fontSize: 12.5, marginTop: 3 }} numberOfLines={1}>{activeLabel} selected</Text>
                </View>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 8 }}>
                {options.map((option) => {
                  const Icon = option.icon;
                  const isActive = currentSection === option.key;
                  const isAudit = option.key === 'audit';
                  const rowBg = isActive ? palette.nudgeBg : 'transparent';
                  const iconBg = isActive ? FYLL_LIME : palette.softFill;
                  const iconColor = isActive ? FYLL_LIME_INK : palette.muted;
                  return (
                    <View
                      key={option.key}
                      style={isAudit ? { marginTop: 5, paddingTop: 8, borderTopWidth: 1, borderTopColor: palette.hairline } : undefined}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${option.label}`}
                        accessibilityState={{ selected: isActive }}
                        onPress={() => handleSelect(option.key)}
                        className="active:opacity-70"
                        style={{
                          minHeight: 52,
                          borderRadius: 14,
                          paddingHorizontal: 10,
                          flexDirection: 'row',
                          alignItems: 'center',
                          backgroundColor: rowBg,
                        }}
                      >
                        <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: iconBg }}>
                          <Icon size={17} color={iconColor} strokeWidth={2.1} />
                        </View>
                        <Text
                          style={{ color: isActive ? palette.text : palette.textSoft, fontSize: 14, fontWeight: '500', marginLeft: 11, flex: 1 }}
                          numberOfLines={1}
                        >
                          {option.label}
                        </Text>
                        {isActive ? (
                          <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME }}>
                            <Check size={13} color={FYLL_LIME_INK} strokeWidth={2.8} />
                          </View>
                        ) : null}
                      </Pressable>
                    </View>
                  );
                })}
              </ScrollView>
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close inventory menu"
            onPress={() => setOpen(false)}
            className="active:opacity-80"
            style={{
              position: 'absolute',
              right: 18,
              bottom: fabBottom,
              width: 58,
              height: 58,
              borderRadius: 29,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: palette.inverseBg,
              zIndex: 60,
            }}
          >
            <X size={23} color={palette.inverseText} strokeWidth={2.6} />
          </Pressable>
        </Pressable>
      </Modal>

      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          setOpen((previous) => !previous);
        }}
        accessibilityRole="button"
        accessibilityLabel={open ? 'Close inventory menu' : 'Open inventory menu'}
        style={{
          position: 'absolute',
          right: 18,
          bottom: fabBottom,
          width: 58,
          height: 58,
          borderRadius: 29,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.text.primary,
          shadowColor: '#000000',
          shadowOpacity: 0.22,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
          zIndex: 50,
        }}
      >
        {open ? <X size={23} color={colors.bg.primary} strokeWidth={2.6} /> : <Menu size={24} color={colors.bg.primary} strokeWidth={2.6} />}
      </Pressable>
    </>
  );
}
