import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { FileText, Link2 } from 'lucide-react-native';
import { FYLL_LIME, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';

// The "create" menu on Payments: a quote (price it first, get approval) or a bill (ask for payment
// now). It floats over the page with a scrim, above the + button on phones and under the New
// button on desktop.
export function PaymentsCreateMenu({
  open,
  onClose,
  onNewQuote,
  onNewBill,
  placement,
}: {
  open: boolean;
  onClose: () => void;
  onNewQuote: () => void;
  onNewBill: () => void;
  placement: { top?: number; bottom?: number; right: number };
}) {
  const palette = usePaymentsPalette();
  if (!open) return null;

  const choose = (action: () => void) => () => {
    onClose();
    action();
  };
  const rows = [
    { key: 'quote', title: 'New quote', caption: 'Price it first, get approval', icon: FileText, lime: true, onPress: choose(onNewQuote) },
    { key: 'bill', title: 'New bill', caption: 'Ask for payment now', icon: Link2, lime: false, onPress: choose(onNewBill) },
  ];

  return (
    <>
      <Pressable
        accessibilityLabel="Close menu"
        onPress={onClose}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 50 }}
      />
      <View
        accessibilityRole="menu"
        style={[
          {
            position: 'absolute',
            right: placement.right,
            top: placement.top,
            bottom: placement.bottom,
            width: 270,
            padding: 6,
            borderRadius: 20,
            zIndex: 60,
            backgroundColor: palette.isDark ? '#232323' : '#FFFFFF',
            borderWidth: 1,
            borderColor: palette.isDark ? 'rgba(255,255,255,0.1)' : palette.border,
          },
          Platform.OS === 'web'
            ? ({ boxShadow: '0 18px 40px rgba(0,0,0,0.5)' } as object)
            : { shadowColor: '#000000', shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 14 },
        ]}
      >
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <Pressable
              key={row.key}
              accessibilityRole="menuitem"
              onPress={row.onPress}
              style={(state) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, backgroundColor: isHovered(state) || state.pressed ? palette.softFill : 'transparent' })}
            >
              <View style={{ width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: row.lime ? 'rgba(213,224,87,0.14)' : palette.softFill }}>
                <Icon size={19} color={row.lime ? (palette.isDark ? FYLL_LIME : palette.limeOnSurface) : palette.textSoft} strokeWidth={2} />
              </View>
              <View style={{ gap: 2, flex: 1 }}>
                <Text style={{ color: palette.text, fontSize: 15, fontWeight: '600' }}>{row.title}</Text>
                <Text style={{ color: palette.faint, fontSize: 12.5 }}>{row.caption}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </>
  );
}
