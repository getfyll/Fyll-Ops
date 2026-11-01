import React from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import type { LucideIcon } from 'lucide-react-native';
import { Check, Filter, X } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { FluidSheet } from '@/components/FluidSheet';
import { FYLL_LIME, FYLL_LIME_HOVER, FYLL_LIME_INK, MoneyText, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

// The filter button used beside the search field on Orders, Inventory and Threads: a round outline button that turns
// lime, with a small dark count, while any filter or sort is active.
export function FilterButton({
  count,
  onPress,
  size = 48,
}: {
  count: number;
  onPress: () => void;
  size?: number;
}) {
  const palette = usePaymentsPalette();
  const active = count > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={active ? `Filter and sort, ${count} active` : 'Filter and sort'}
      style={(state) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        backgroundColor: active ? (isHovered(state) || state.pressed ? FYLL_LIME_HOVER : FYLL_LIME) : isHovered(state) || state.pressed ? palette.softFill : palette.inset,
        borderWidth: active ? 0 : 1,
        borderColor: palette.border,
      })}
    >
      <Filter size={size >= 46 ? 18 : 16} color={active ? FYLL_LIME_INK : palette.muted} strokeWidth={2.1} />
      {active ? (
        <View style={{ position: 'absolute', top: -3, right: -3, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME_INK }}>
          <Text style={{ color: FYLL_LIME, fontSize: 10, fontWeight: '700' }}>{count}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

// The filter and sort sheet. On phones it rises with the same fluid motion as Home's quick-actions sheet; on a wide web
// screen it stays a side drawer.
export function FilterSheet({
  visible,
  onClose,
  isWebDesktop,
  title = 'Filter & sort',
  onReset,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  isWebDesktop: boolean;
  title?: string;
  onReset?: () => void;
  children: React.ReactNode;
}) {
  const palette = usePaymentsPalette();

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 14 }}>
      <MoneyText style={{ color: palette.text, fontSize: 24, letterSpacing: -0.5 }}>{title}</MoneyText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {onReset ? (
          <Pressable
            onPress={() => {
              if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onReset();
            }}
            accessibilityRole="button"
            style={(state) => ({ height: 38, paddingHorizontal: 14, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent' })}
          >
            <Text style={{ color: palette.muted, fontSize: 14, fontWeight: '600' }}>Reset</Text>
          </Pressable>
        ) : null}
        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={(state) => ({ width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: state.pressed ? palette.softFill : palette.inset, borderWidth: 1, borderColor: palette.border })}
        >
          <X size={17} color={palette.muted} strokeWidth={2.4} />
        </Pressable>
      </View>
    </View>
  );

  const body = (
    <>
      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
        {children}
      </ScrollView>
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onClose();
        }}
        accessibilityRole="button"
        style={(state) => ({ height: 52, borderRadius: 999, alignItems: 'center', justifyContent: 'center', marginTop: 8, backgroundColor: state.pressed || isHovered(state) ? FYLL_LIME_HOVER : FYLL_LIME })}
      >
        <Text style={{ color: FYLL_LIME_INK, fontSize: 16, fontWeight: '700' }}>Apply</Text>
      </Pressable>
    </>
  );

  if (!isWebDesktop) {
    return (
      <FluidSheet visible={visible} onClose={onClose} heightFraction={0.82}>
        {header}
        {body}
      </FluidSheet>
    );
  }

  return (
    <Modal visible={visible} animationType="none" transparent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: palette.isDark ? 'rgba(0,0,0,0.62)' : 'rgba(20,20,20,0.38)', flexDirection: 'row', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable
          onPress={(event) => event.stopPropagation()}
          style={{ width: 420, maxWidth: '100%', backgroundColor: palette.card, borderTopLeftRadius: 28, borderBottomLeftRadius: 28, borderWidth: 1, borderRightWidth: 0, borderColor: palette.border, padding: 22, overflow: 'hidden' }}
        >
          {header}
          {body}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function FilterSection({ title, children, first = false }: { title: string; children: React.ReactNode; first?: boolean }) {
  const palette = usePaymentsPalette();
  return (
    <View style={{ marginTop: first ? 0 : 20 }}>
      <Text style={{ color: palette.faint, fontSize: 11, fontWeight: '600', letterSpacing: 1.3, textTransform: 'uppercase', marginLeft: 6, marginBottom: 10 }}>{title}</Text>
      <View style={{ gap: 8 }}>{children}</View>
    </View>
  );
}

// One choice in the sheet: a rounded tile that turns lime-tinted with a check when picked.
export function FilterOption({
  label,
  description,
  icon: Icon,
  dotColor,
  selected,
  onPress,
}: {
  label: string;
  description?: string;
  icon?: LucideIcon;
  dotColor?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const palette = usePaymentsPalette();
  return (
    <Pressable
      onPress={() => {
        if (Platform.OS !== 'web') void Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={(state) => ({
        minHeight: 54,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: selected ? palette.nudgeBorder : palette.border,
        backgroundColor: selected ? palette.nudgeBg : state.pressed || isHovered(state) ? palette.softFill : palette.inset,
      })}
    >
      {Icon ? <Icon size={18} color={selected ? palette.limeOnSurface : palette.muted} strokeWidth={2.1} /> : null}
      {dotColor ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor }} /> : null}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>
        <Text style={{ color: palette.text, fontSize: 14, fontWeight: selected ? '700' : '600' }} numberOfLines={1}>{label}</Text>
        {description ? <Text style={{ color: palette.faint, fontSize: 12 }} numberOfLines={1}>{description}</Text> : null}
      </View>
      {selected ? (
        <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: FYLL_LIME }}>
          <Check size={13} color={FYLL_LIME_INK} strokeWidth={3} />
        </View>
      ) : null}
    </Pressable>
  );
}
