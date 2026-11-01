import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Check, ChevronDown, ChevronUp, X } from 'lucide-react-native';
import { HomeCard } from '@/components/home/home-ui';
import { FYLL_LIME, FYLL_LIME_INK, MoneyText, isHovered, usePaymentsPalette } from '@/components/payments/payments-ui';
import { storage } from '@/lib/storage';

export type OnboardingStep = {
  id: string;
  title: string;
  shortLabel: string;
  description: string;
  complete: boolean;
  actionLabel: string;
  route: string;
  settingsPanel?: string;
};

// Remembered on this device so the card stays tucked away once it has been collapsed.
const COLLAPSED_STORAGE_KEY = 'dashboard-onboarding-collapsed';

// A compact "Finish setting up" strip: title and a done/total chip, one progress bar and every step in a single row.
// The chevron collapses it down to just the title.
export function OnboardingChecklistCard({
  steps,
  onDismiss,
  onStepPress,
  inset = true,
}: {
  steps: OnboardingStep[];
  onDismiss: () => void;
  onStepPress: (step: OnboardingStep) => void;
  inset?: boolean;
}) {
  const palette = usePaymentsPalette();
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const completedCount = steps.filter((step) => step.complete).length;
  const progress = steps.length > 0 ? completedCount / steps.length : 0;
  const nextStepId = steps.find((step) => !step.complete)?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve(storage.getItem(COLLAPSED_STORAGE_KEY))
      .then((value) => {
        if (!cancelled) setCollapsed(value === 'true');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      const next = !current;
      void Promise.resolve(storage.setItem(COLLAPSED_STORAGE_KEY, String(next))).catch(() => undefined);
      return next;
    });
  };

  const ChevronIcon = collapsed ? ChevronDown : ChevronUp;

  return (
    <View className={inset ? 'px-5 pt-4' : undefined}>
      <HomeCard style={{ gap: collapsed ? 0 : 12, paddingVertical: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            onPress={toggleCollapsed}
            accessibilityRole="button"
            accessibilityState={{ expanded: !collapsed }}
            accessibilityLabel={collapsed ? 'Show setup checklist' : 'Hide setup checklist'}
            style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            <MoneyText style={{ color: palette.text, fontSize: 17, letterSpacing: -0.4 }} numberOfLines={1}>Finish setting up</MoneyText>
            <View style={{ height: 22, paddingHorizontal: 10, borderRadius: 999, justifyContent: 'center', backgroundColor: palette.nudgeBg }}>
              <Text style={{ color: palette.limeOnSurface, fontSize: 12, fontWeight: '700' }}>{completedCount}/{steps.length}</Text>
            </View>
          </Pressable>
          <Pressable
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss setup checklist"
            style={(state) => ({ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent' })}
          >
            <X size={15} color={palette.faint} strokeWidth={2.2} />
          </Pressable>
          <Pressable
            onPress={toggleCollapsed}
            accessibilityRole="button"
            accessibilityLabel={collapsed ? 'Show setup checklist' : 'Hide setup checklist'}
            style={(state) => ({ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: state.pressed || isHovered(state) ? palette.softFill : 'transparent' })}
          >
            <ChevronIcon size={18} color={palette.muted} strokeWidth={2.2} />
          </Pressable>
        </View>

        {collapsed ? null : (
          <>
            <View style={{ height: 6, borderRadius: 999, overflow: 'hidden', backgroundColor: palette.softFill }}>
              <View style={{ width: `${Math.round(progress * 100)}%`, height: 6, borderRadius: 999, backgroundColor: FYLL_LIME }} />
            </View>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 8, rowGap: 2 }}>
              {steps.map((step) => {
                const isNext = step.id === nextStepId;
                return (
                  <Pressable
                    key={step.id}
                    onPress={() => onStepPress(step)}
                    accessibilityRole="button"
                    style={(state) => ({
                      flexGrow: 1,
                      flexBasis: 150,
                      minWidth: 140,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 10,
                      paddingVertical: 8,
                      paddingHorizontal: 8,
                      borderRadius: 12,
                      backgroundColor: isHovered(state) || state.pressed ? palette.softFill : 'transparent',
                    })}
                  >
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: step.complete ? FYLL_LIME : 'transparent',
                        borderWidth: step.complete ? 0 : 1.5,
                        borderColor: isNext ? palette.limeOnSurface : palette.outline,
                      }}
                    >
                      {step.complete ? <Check size={13} color={FYLL_LIME_INK} strokeWidth={3} /> : null}
                    </View>
                    <Text
                      style={{
                        flex: 1,
                        color: step.complete ? palette.faint : palette.text,
                        textDecorationLine: step.complete ? 'line-through' : 'none',
                        fontSize: 13,
                        fontWeight: isNext ? '700' : '600',
                        lineHeight: 17,
                      }}
                      numberOfLines={2}
                    >
                      {step.shortLabel}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
      </HomeCard>
    </View>
  );
}
