import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import useAuthStore from '@/lib/state/auth-store';
import { useBusinessSettings } from '@/hooks/useBusinessSettings';
import { buildStorefrontUrl } from '@/lib/storefront-url';
import { fetchLatestMilestone } from '@/lib/supabase/milestones';
import { FYLL_LIME, FYLL_LIME_INK, usePaymentsPalette } from '@/components/payments/payments-ui';
import { BricolageGrotesque_400Regular, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold, useFonts } from '@expo-google-fonts/bricolage-grotesque';
import { Lock } from 'lucide-react-native';
import { MilestoneCelebration } from './MilestoneCelebration';

// Settings -> System -> "Replay milestone celebration". Shows the latest milestone again, any time, and changes
// nothing: it is not marked celebrated and nothing is saved.
export function MilestoneReplay({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const palette = usePaymentsPalette();
  const [fontsLoaded] = useFonts({ BricolageGrotesque_400Regular, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold });
  const businessId = useAuthStore((s) => s.businessId ?? s.currentUser?.businessId ?? null);
  const { businessName, companyName, businessLogo, storefrontEnabled, storefrontSlug } = useBusinessSettings();

  const latestQuery = useQuery({
    queryKey: ['latest-milestone', businessId],
    queryFn: () => fetchLatestMilestone(businessId!),
    enabled: visible && Boolean(businessId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });

  // Keep the celebration mounted until it is closed, even if the query refreshes underneath it.
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!visible) setOpen(false);
    else if (latestQuery.data) setOpen(true);
  }, [visible, latestQuery.data]);

  if (!visible) return null;

  if (open && latestQuery.data) {
    const storefrontUrl = storefrontEnabled
      ? buildStorefrontUrl({ storefrontSlug, businessName, companyName }).replace(/^https?:\/\//, '')
      : null;
    return (
      <MilestoneCelebration
        visible
        businessName={(businessName || companyName || 'your business').trim()}
        businessLogo={businessLogo}
        storefrontUrl={storefrontUrl}
        milestone={latestQuery.data.milestone}
        totalOrders={latestQuery.data.totalOrders}
        nextMilestone={latestQuery.data.nextMilestone}
        onClose={onClose}
        onShared={() => undefined}
      />
    );
  }

  const failed = latestQuery.isError;
  const headline = failed ? 'Milestones are not available yet' : 'Your first milestone is at 100 orders';
  const body = failed
    ? 'Please try again in a little while.'
    : "Keep going. We'll celebrate it with you the moment you get there.";
  const display = (weight: '600' | '700' | '800') =>
    fontsLoaded
      ? ({ fontFamily: weight === '800' ? 'BricolageGrotesque_800ExtraBold' : weight === '600' ? 'BricolageGrotesque_600SemiBold' : 'BricolageGrotesque_700Bold', fontWeight: '400' } as const)
      : ({ fontWeight: weight } as const);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Pressable onPress={() => undefined} style={{ width: '100%', maxWidth: 360, borderRadius: 30, paddingHorizontal: 26, paddingTop: 30, paddingBottom: 24, gap: 18, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, alignItems: 'center' }}>
          {latestQuery.isLoading ? (
            <View style={{ height: 180, alignItems: 'center', justifyContent: 'center' }}>
              <ActivityIndicator color={palette.text} />
            </View>
          ) : (
            <>
              <View style={{ width: 132, height: 132, borderRadius: 66, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(213,224,87,0.55)', alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 108, height: 108, borderRadius: 54, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={[{ color: palette.faint, fontSize: 40, letterSpacing: -1.5, opacity: 0.7 }, display('800')]}>100</Text>
                  <Text style={{ color: palette.faint, fontSize: 10, letterSpacing: 2.2, fontWeight: '700' }}>ORDERS</Text>
                </View>
                <View style={{ position: 'absolute', right: 2, bottom: 6, width: 34, height: 34, borderRadius: 17, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: palette.card }}>
                  <Lock size={15} color={FYLL_LIME_INK} strokeWidth={2.4} />
                </View>
              </View>
              <View style={{ gap: 6, alignItems: 'center' }}>
                <Text style={[{ color: palette.text, fontSize: 21, lineHeight: 26, letterSpacing: -0.2, textAlign: 'center' }, display('600')]}>{headline}</Text>
                <Text style={{ color: palette.muted, fontSize: 14, lineHeight: 21, letterSpacing: 0.3, textAlign: 'center' }}>{body}</Text>
              </View>
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                style={({ pressed }) => ({ alignSelf: 'stretch', height: 50, borderRadius: 999, backgroundColor: FYLL_LIME, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1, marginTop: 4 })}
              >
                <Text style={[{ color: FYLL_LIME_INK, fontSize: 16 }, display('700')]}>Got it</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
