import React, { useState } from 'react';
import { Modal, View, Text, Pressable, Image, ActivityIndicator, Platform } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { FYLL_LIME, FYLL_LIME_INK, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';
import type { PrintSize, PrintStyle } from '@/lib/fyll-pay-print';

const fieldThumb = require('../../../assets/fyll-field-phone.jpg');

type Props = {
  visible: boolean;
  onClose: () => void;
  onPrint: (options: { size: PrintSize; style: PrintStyle }) => Promise<void> | void;
  buttonFont: object;
};

// Choose paper size and colour before printing the Fyll Pay counter card.
export function PrintCardModal({ visible, onClose, onPrint, buttonFont }: Props) {
  const palette = usePaymentsPalette();
  const [size, setSize] = useState<PrintSize>('A5');
  const [style, setStyle] = useState<PrintStyle>('colour');
  const [busy, setBusy] = useState(false);

  const print = async () => {
    setBusy(true);
    try {
      await onPrint({ size, style });
    } finally {
      setBusy(false);
    }
  };

  const option = ({ selected, onPress, title, caption, art, label }: { selected: boolean; onPress: () => void; title: string; caption: string; art: React.ReactNode; label: string }) => (
    <Pressable
      key={title}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      style={(state) => ({
        flex: 1,
        minWidth: 0,
        borderRadius: 18,
        borderWidth: selected ? 2 : 1,
        borderColor: selected ? FYLL_LIME : palette.border,
        backgroundColor: selected ? palette.nudgeBg : isHovered(state) ? palette.cardHover : palette.card,
        padding: selected ? 13 : 14,
        gap: 10,
      })}
    >
      <View style={{ height: 92, alignItems: 'center', justifyContent: 'flex-end' }}>{art}</View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ color: palette.text, fontSize: 15, fontWeight: '700' }}>{title}</Text>
        {selected ? (
          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center' }}>
            <Check size={13} color={FYLL_LIME_INK} strokeWidth={3} />
          </View>
        ) : null}
      </View>
      <Text style={{ color: palette.muted, fontSize: 12.5, lineHeight: 17 }}>{caption}</Text>
    </Pressable>
  );

  // Small page sketches: paper proportions for size, Field vs white for colour.
  const pageSketch = (w: number, h: number, colour: boolean) => (
    <View style={{ width: w, height: h, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: colour ? 'transparent' : palette.outline, backgroundColor: colour ? '#3F4A08' : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
      {colour ? <Image source={fieldThumb} resizeMode="cover" style={{ position: 'absolute', width: '100%', height: '100%' }} /> : null}
      <View style={{ width: w * 0.6, height: w * 0.6, borderRadius: 4, backgroundColor: '#FFFFFF', borderWidth: colour ? 0 : 1, borderColor: '#141414', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: w * 0.38, height: w * 0.38, backgroundColor: '#141414', borderRadius: 2 }} />
      </View>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end' }}>
        <Pressable
          onPress={() => undefined}
          style={{
            width: '100%',
            maxWidth: 520,
            backgroundColor: palette.page,
            borderRadius: 26,
            borderBottomLeftRadius: Platform.OS === 'web' ? 26 : 0,
            borderBottomRightRadius: Platform.OS === 'web' ? 26 : 0,
            padding: 22,
            gap: 18,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <View style={{ flexShrink: 1, gap: 4 }}>
              <Text accessibilityRole="header" style={{ color: palette.text, fontSize: 20, fontWeight: '800' }}>Print counter card</Text>
              <Text style={{ color: palette.muted, fontSize: 13.5, lineHeight: 19 }}>Your QR on a Fyll Pay card, with three steps that show customers how to pay.</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" hitSlop={8} style={(state) => ({ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
              <X size={20} color={palette.text} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={{ gap: 10 }}>
            <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>Paper size</Text>
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 10 }}>
              {option({ selected: size === 'A4', onPress: () => setSize('A4'), title: 'A4', caption: 'For a wall, door or window', label: 'A4 paper', art: pageSketch(64, 90, style === 'colour') })}
              {option({ selected: size === 'A5', onPress: () => setSize('A5'), title: 'A5', caption: 'For a counter or table stand', label: 'A5 paper', art: pageSketch(46, 64, style === 'colour') })}
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <Text style={{ color: palette.faint, fontSize: 12, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' }}>Print in</Text>
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 10 }}>
              {option({ selected: style === 'colour', onPress: () => setStyle('colour'), title: 'Colour', caption: 'Fyll green background', label: 'Colour', art: pageSketch(size === 'A4' ? 64 : 52, size === 'A4' ? 90 : 73, true) })}
              {option({ selected: style === 'mono', onPress: () => setStyle('mono'), title: 'Black & white', caption: 'Uses less ink, prints anywhere', label: 'Black and white', art: pageSketch(size === 'A4' ? 64 : 52, size === 'A4' ? 90 : 73, false) })}
            </View>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={onClose} accessibilityRole="button" style={(state) => ({ flex: 1, height: 50, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center', backgroundColor: isHovered(state) ? palette.softFill : 'transparent' })}>
              <Text style={[{ color: palette.text, fontSize: 15 }, buttonFont]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={print} disabled={busy} accessibilityRole="button" style={(state) => ({ flex: 2, height: 50, borderRadius: 999, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center', opacity: state.pressed ? 0.85 : 1 })}>
              {busy ? <ActivityIndicator color={FYLL_LIME_INK} /> : <Text style={[{ color: FYLL_LIME_INK, fontSize: 15 }, buttonFont]}>Print {size} · {style === 'colour' ? 'Colour' : 'Black & white'}</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
