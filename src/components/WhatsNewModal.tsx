import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useFonts, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { Check, LayoutDashboard, Package, RefreshCw, Share2, Sparkles, Truck, Zap, type LucideIcon } from 'lucide-react-native';
import { FYLL_LIME, FYLL_LIME_INK } from '@/components/payments/payments-ui';
import { useBreakpoint } from '@/lib/useBreakpoint';
import { useThemeColors } from '@/lib/theme';
import type { ReleaseIcon } from '@/lib/release-notes';
import type { WhatsNewState } from '@/hooks/useWhatsNew';

const ICONS: Record<ReleaseIcon, LucideIcon> = {
  zap: Zap,
  package: Package,
  home: LayoutDashboard,
  sparkles: Sparkles,
  truck: Truck,
  share: Share2,
};

type Props = {
  state: WhatsNewState | null;
  onDismiss: () => void;
  onUpdate: () => void;
};

export function WhatsNewModal({ state, onDismiss, onUpdate }: Props) {
  const colors = useThemeColors();
  const { isMobile } = useBreakpoint();
  const [fontsLoaded] = useFonts({ BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold });
  if (!state) return null;
  const bold = fontsLoaded ? { fontFamily: 'BricolageGrotesque_700Bold', fontWeight: '400' as const } : { fontWeight: '700' as const };
  const semi = fontsLoaded ? { fontFamily: 'BricolageGrotesque_600SemiBold', fontWeight: '400' as const } : { fontWeight: '600' as const };

  const isUpdate = state.mode === 'update';
  const { release } = state;
  // Mobile: 12px item titles, 10px descriptions. Web: 16px titles, 12px body.
  const titleSize = isMobile ? 12 : 16;
  const bodySize = isMobile ? 10 : 12;
  const bodyLine = isMobile ? 15 : 18;
  const iconBox = isMobile ? 34 : 40;
  const limeWash = 'rgba(213,224,87,0.16)';
  const sectionLabel = { color: colors.text.muted, fontSize: 10, fontWeight: '600' as const, letterSpacing: 0.6, textTransform: 'uppercase' as const };

  const content = (
    <>
      <ScrollView
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ gap: 20, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ gap: 6 }}>
          <View style={{ alignSelf: 'flex-start', height: 24, paddingHorizontal: 10, borderRadius: 999, backgroundColor: limeWash, justifyContent: 'center' }}>
            <Text style={{ color: colors.text.primary, fontSize: 10, fontWeight: '700', letterSpacing: 0.3 }}>VERSION {release.version}</Text>
          </View>
          <Text style={{ color: colors.text.primary, fontSize: isMobile ? 24 : 28, ...bold, letterSpacing: -0.6, lineHeight: isMobile ? 29 : 33 }}>
            {isUpdate ? 'A new version\nof Fyll Ops is ready' : 'What’s new in\nFyll Ops'}
          </Text>
        </View>

        {release.features.length > 0 ? (
          <View style={{ gap: 16 }}>
            <Text style={sectionLabel}>New features</Text>
            {release.features.map((feature) => {
              const Icon = ICONS[feature.icon] ?? Sparkles;
              return (
                <View key={feature.title} style={{ flexDirection: 'row', gap: 14, alignItems: 'flex-start' }}>
                  <View style={{ width: iconBox, height: iconBox, borderRadius: 12, backgroundColor: limeWash, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon size={isMobile ? 17 : 20} color={colors.text.primary} strokeWidth={1.9} />
                  </View>
                  <View style={{ flex: 1, gap: 3, paddingTop: 2 }}>
                    <Text style={{ color: colors.text.primary, fontSize: titleSize, ...bold }}>{feature.title}</Text>
                    <Text style={{ color: colors.text.muted, fontSize: bodySize, lineHeight: bodyLine }}>{feature.body}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : null}

        {release.fixes.length > 0 ? (
          <View style={{ gap: 12, borderTopWidth: 1, borderTopColor: colors.border.light, paddingTop: 16 }}>
            <Text style={sectionLabel}>Bug fixes</Text>
            {release.fixes.map((fix) => (
              <View key={fix} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: colors.bg.secondary, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                  <Check size={10} color={colors.text.secondary} strokeWidth={3} />
                </View>
                <Text style={{ flex: 1, color: colors.text.secondary, fontSize: bodySize, lineHeight: bodyLine }}>{fix}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View style={{ gap: 8, paddingTop: 18 }}>
        <Pressable
          onPress={isUpdate ? onUpdate : onDismiss}
          style={({ pressed }) => ({
            height: isMobile ? 50 : 46,
            borderRadius: 999,
            backgroundColor: FYLL_LIME,
            opacity: pressed ? 0.85 : 1,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          })}
        >
          {isUpdate ? <RefreshCw size={16} color={FYLL_LIME_INK} strokeWidth={2.4} /> : null}
          <Text style={{ color: FYLL_LIME_INK, fontSize: isMobile ? 14 : 14.5, ...semi }}>{isUpdate ? 'Update now' : 'Continue'}</Text>
        </Pressable>
        {isUpdate ? (
          <Pressable onPress={onDismiss} style={{ alignItems: 'center', paddingVertical: 6 }}>
            <Text style={{ color: colors.text.muted, fontSize: 12, fontWeight: '500' }}>Later</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={isUpdate ? onDismiss : onDismiss}>
      {isMobile ? (
        <View style={{ flex: 1, backgroundColor: colors.bg.primary, paddingTop: 64, paddingHorizontal: 24, paddingBottom: 28 }}>
          {content}
        </View>
      ) : (
        <View style={{ flex: 1, backgroundColor: 'rgba(8,8,8,0.68)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <View
            style={{
              width: '100%',
              maxWidth: 520,
              maxHeight: '90%',
              backgroundColor: colors.bg.card,
              borderWidth: 1,
              borderColor: colors.border.light,
              borderRadius: 24,
              padding: 32,
              paddingBottom: 26,
            }}
          >
            {content}
          </View>
        </View>
      )}
    </Modal>
  );
}
