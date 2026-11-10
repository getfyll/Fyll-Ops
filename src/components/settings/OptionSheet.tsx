import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Check, X } from 'lucide-react-native';

export type OptionSheetOption = { value: string; label: string; hint?: string };

export type OptionSheetPalette = {
  surface: string;
  ink: string;
  faint: string;
  input: string;
  navButton: string;
  limeWash: string;
  limeInk: string;
};

// A centered "pick one" card used by the settings pages (country, time of day and so on).
export function OptionSheet({
  visible,
  title,
  options,
  selected,
  palette,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: OptionSheetOption[];
  selected: string;
  palette: OptionSheetPalette;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 440, maxHeight: '70%', backgroundColor: palette.surface, borderRadius: 28, paddingTop: 18, paddingBottom: 12, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, marginBottom: 8 }}>
            <Text style={{ color: palette.ink, fontFamily: 'BricolageGrotesque_700Bold', fontSize: 18 }}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close" style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.navButton }}>
              <X size={16} color={palette.ink} />
            </Pressable>
          </View>
          <ScrollView>
            {options.map((option) => {
              const isSelected = option.value === selected;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => onSelect(option.value)}
                  style={({ pressed }) => ({ paddingHorizontal: 22, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: isSelected ? palette.limeWash : pressed ? palette.input : 'transparent' })}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: palette.ink, fontWeight: '600', fontSize: 14 }}>{option.label}</Text>
                    {option.hint ? <Text style={{ color: palette.faint, fontSize: 12, marginTop: 1 }}>{option.hint}</Text> : null}
                  </View>
                  {isSelected ? <Check size={18} color={palette.limeInk} strokeWidth={2.4} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
