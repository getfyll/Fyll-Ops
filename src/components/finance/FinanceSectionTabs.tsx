import React, { useEffect, useRef } from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FYLL_LIME, FYLL_LIME_INK, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

export type SectionTab = { key: string; label: string };

const tap = () => {
  if (Platform.OS !== 'web') void Haptics.selectionAsync();
};

// Keeps the picked tab in view when the row scrolls sideways.
function useScrollActiveIntoView(activeKey: string | null) {
  const scrollRef = useRef<ScrollView | null>(null);
  const offsets = useRef<Record<string, { x: number; width: number }>>({});
  const viewport = useRef<number>(0);
  useEffect(() => {
    if (!activeKey) return;
    const spot = offsets.current[activeKey];
    if (!spot || !scrollRef.current) return;
    scrollRef.current.scrollTo({ x: Math.max(0, spot.x - (viewport.current - spot.width) / 2), animated: true });
  }, [activeKey]);
  return { scrollRef, offsets, viewport };
}

// The main Finance sections as tabs under the page title: plain text with a lime line under the one you are on.
export function FinanceSectionTabs({
  tabs,
  activeKey,
  onSelect,
}: {
  tabs: SectionTab[];
  activeKey: string | null;
  onSelect: (key: string) => void;
}) {
  const palette = usePaymentsPalette();
  const { scrollRef, offsets, viewport } = useScrollActiveIntoView(activeKey);

  return (
    <View style={{ marginHorizontal: -16, borderBottomWidth: 1, borderBottomColor: palette.hairline }}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(event) => { viewport.current = event.nativeEvent.layout.width; }}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 22 }}
        accessibilityRole="tablist"
      >
        {tabs.map((tab) => {
          const active = tab.key === activeKey;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              onLayout={(event) => { offsets.current[tab.key] = { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width }; }}
              onPress={() => {
                tap();
                onSelect(tab.key);
              }}
              style={{ height: 44, justifyContent: 'center', marginBottom: -1, borderBottomWidth: 3, borderBottomColor: active ? FYLL_LIME : 'transparent' }}
            >
              <Text style={{ color: active ? palette.text : palette.faint, fontSize: 15, fontWeight: '700' }} numberOfLines={1}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

// A second row of pill tabs for the pages inside a section (for example the Procurement pages).
export function FinanceSubTabs({
  tabs,
  activeKey,
  onSelect,
}: {
  tabs: SectionTab[];
  activeKey: string | null;
  onSelect: (key: string) => void;
}) {
  const palette = usePaymentsPalette();
  const { scrollRef, offsets, viewport } = useScrollActiveIntoView(activeKey);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onLayout={(event) => { viewport.current = event.nativeEvent.layout.width; }}
      style={{ marginHorizontal: -16, flexGrow: 0 }}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      accessibilityRole="tablist"
    >
      {tabs.map((tab) => {
        const active = tab.key === activeKey;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onLayout={(event) => { offsets.current[tab.key] = { x: event.nativeEvent.layout.x, width: event.nativeEvent.layout.width }; }}
            onPress={() => {
              tap();
              onSelect(tab.key);
            }}
            style={(state) => ({
              height: 38,
              paddingHorizontal: 18,
              borderRadius: 999,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: active ? 0 : 1,
              borderColor: palette.border,
              backgroundColor: active ? FYLL_LIME : isHovered(state) || state.pressed ? palette.softFill : palette.inset,
            })}
          >
            <Text style={{ color: active ? FYLL_LIME_INK : palette.muted, fontSize: 14, fontWeight: '600' }} numberOfLines={1}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
