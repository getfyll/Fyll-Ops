import React, { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Box, Briefcase, Check, ClipboardCheck, Menu, Package } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { useThemeColors } from '@/lib/theme';
import { useTabBarHeight } from '@/lib/useTabBarHeight';

type InventorySection = 'products' | 'services' | 'warehouse';
type InventoryMenuOption = InventorySection | 'audit';

type InventoryMobileFabProps = {
  currentSection: InventorySection;
  visible?: boolean;
  onSelectProducts?: () => void;
  onSelectServices?: () => void;
  onSelectWarehouse?: () => void;
};

export function InventoryMobileFab({
  currentSection,
  visible = true,
  onSelectProducts,
  onSelectServices,
  onSelectWarehouse,
}: InventoryMobileFabProps) {
  const router = useRouter();
  const colors = useThemeColors();
  const tabBarHeight = useTabBarHeight();
  const [open, setOpen] = useState(false);

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
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.28)' }}
          onPress={() => setOpen(false)}
        >
          <View
            style={{
              position: 'absolute',
              right: 16,
              bottom: Math.max(12, tabBarHeight - 4),
              width: 268,
              maxHeight: '78%',
              borderRadius: 22,
              borderWidth: 1,
              borderColor: colors.border.light,
              backgroundColor: colors.bg.card,
              overflow: 'hidden',
              shadowColor: '#000000',
              shadowOpacity: 0.18,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 10 },
              elevation: 8,
            }}
          >
            <Pressable onPress={(event) => event.stopPropagation()}>
              <View className="px-4 py-3" style={{ borderBottomWidth: 1, borderBottomColor: colors.border.light }}>
                <Text style={{ color: colors.text.primary, fontSize: 15, fontWeight: '700' }}>Inventory Menu</Text>
                <Text style={{ color: colors.text.tertiary, fontSize: 12, marginTop: 2 }}>{activeLabel}</Text>
              </View>
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 6 }}>
                {options.map((option) => {
                  const Icon = option.icon;
                  const isActive = currentSection === option.key;
                  const isAudit = option.key === 'audit';
                  const rowBg = isAudit ? '#8B5CF6' : isActive ? colors.bg.secondary : 'transparent';
                  const iconColor = isAudit ? '#FFFFFF' : isActive ? colors.text.primary : colors.text.tertiary;
                  const textColor = isAudit ? '#FFFFFF' : isActive ? colors.text.primary : colors.text.secondary;
                  return (
                    <Pressable
                      key={option.key}
                      onPress={() => handleSelect(option.key)}
                      className="flex-row items-center px-4"
                      style={{
                        minHeight: isAudit ? 48 : 44,
                        marginHorizontal: isAudit ? 8 : 0,
                        marginVertical: isAudit ? 6 : 0,
                        borderRadius: isAudit ? 16 : 0,
                        backgroundColor: rowBg,
                        borderLeftWidth: !isAudit && isActive ? 3 : 0,
                        borderLeftColor: colors.text.primary,
                      }}
                    >
                      <Icon size={17} color={iconColor} strokeWidth={2.2} />
                      <Text
                        style={{
                          color: textColor,
                          fontSize: 14,
                          fontWeight: isAudit || isActive ? '700' : '600',
                          marginLeft: 10,
                          flex: 1,
                        }}
                        numberOfLines={1}
                      >
                        {option.label}
                      </Text>
                      {isActive ? <Check size={15} color={colors.text.primary} strokeWidth={2.5} /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </View>
        </Pressable>
      </Modal>

      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') {
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          setOpen(true);
        }}
        style={{
          position: 'absolute',
          right: 18,
          bottom: Math.max(12, tabBarHeight - 30),
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
        <Menu size={24} color={colors.bg.primary} strokeWidth={2.6} />
      </Pressable>
    </>
  );
}
