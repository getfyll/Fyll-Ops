import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { Check, ClipboardCheck, Clock3, CreditCard, FileText, Glasses, Package, ShieldCheck, X } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { usePaymentsPalette, type PaymentsPalette } from '@/components/payments/payments-ui';
import { HomeCard, HomeCardHeader, HomeRow } from '@/components/home/home-ui';
import { storage } from '@/lib/storage';
import type { HomeNeed, HomeNeedIcon, HomeNeedTone } from '@/lib/home-needs';

const ICONS: Record<HomeNeedIcon, LucideIcon> = {
  clock: Clock3,
  card: CreditCard,
  box: Package,
  lens: Glasses,
  qc: ClipboardCheck,
  case: FileText,
  verify: ShieldCheck,
};

const toneStyle = (palette: PaymentsPalette, tone: HomeNeedTone) => {
  if (tone === 'urgent') return { bg: palette.dangerBg, ink: palette.danger };
  if (tone === 'warn') return { bg: palette.warnBg, ink: palette.warn };
  return { bg: palette.softFill, ink: palette.textSoft };
};

const getDayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

// "Handled" ticks last for the day: a cleared item stays cleared until tomorrow,
// or until the person taps "Bring them back".
export function useDismissedNeeds(businessId: string | null) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const storageKey = businessId ? `home-needs-dismissed:${businessId}:${getDayKey()}` : null;

  useEffect(() => {
    let cancelled = false;
    if (!storageKey) {
      setDismissed([]);
      return;
    }
    void storage.getItem(storageKey).then((value) => {
      if (cancelled) return;
      try {
        const parsed = value ? JSON.parse(value) : [];
        setDismissed(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
      } catch {
        setDismissed([]);
      }
    }).catch(() => {
      if (!cancelled) setDismissed([]);
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  const persist = useCallback((next: string[]) => {
    setDismissed(next);
    if (storageKey) void storage.setItem(storageKey, JSON.stringify(next));
  }, [storageKey]);

  const dismiss = useCallback((id: string) => {
    persist(dismissed.includes(id) ? dismissed : [...dismissed, id]);
  }, [dismissed, persist]);

  const restore = useCallback(() => persist([]), [persist]);

  return { dismissed, dismiss, restore };
}

function NeedIcon({ need, size, palette }: { need: HomeNeed; size: number; palette: PaymentsPalette }) {
  const Icon = ICONS[need.icon];
  const tone = toneStyle(palette, need.tone);
  return (
    <View style={{ width: size, height: size, borderRadius: size > 40 ? 12 : 11, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Icon size={size > 40 ? 20 : 18} color={tone.ink} strokeWidth={1.9} />
    </View>
  );
}

function AllCaught({ palette, onRestore, compact }: { palette: PaymentsPalette; onRestore: () => void; compact?: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: 8, paddingVertical: compact ? 22 : 40 }}>
      <View style={{ width: compact ? 48 : 56, height: compact ? 48 : 56, borderRadius: 28, backgroundColor: palette.tones.verified.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Check size={compact ? 22 : 26} color={palette.tones.verified.ink} strokeWidth={2.6} />
      </View>
      <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>You're all caught up</Text>
      <Text style={{ color: palette.faint, fontSize: 12, textAlign: 'center' }}>Nothing needs you right now. New items appear here as they come up.</Text>
      <Pressable
        onPress={onRestore}
        className="active:opacity-80"
        style={{ height: 34, paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}
      >
        <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }}>Bring them back</Text>
      </Pressable>
    </View>
  );
}

type NeedsProps = {
  needs: HomeNeed[];
  onAction: (route: string) => void;
  onDismiss: (id: string) => void;
  onRestore: () => void;
};

// Desktop: the full list as a card, most urgent first.
export function NeedsYouCard({ needs, onAction, onDismiss, onRestore }: NeedsProps) {
  const palette = usePaymentsPalette();
  return (
    <HomeCard flush>
      <HomeCardHeader
        flushPadding
        title={`Needs you today${needs.length ? ` \u00b7 ${needs.length}` : ''}`}
        subtitle="Most urgent first"
      />
      {needs.length === 0 ? (
        <View style={{ borderTopWidth: 1, borderTopColor: palette.hairline }}>
          <AllCaught palette={palette} onRestore={onRestore} />
        </View>
      ) : needs.map((need) => (
        <HomeRow key={need.id} first={false} padded style={{ gap: 14, paddingVertical: 14 }}>
          <NeedIcon need={need} size={38} palette={palette} />
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600' }}>{need.title}</Text>
            <Text style={{ color: palette.faint, fontSize: 12, lineHeight: 17 }}>{need.body}</Text>
          </View>
          <Pressable
            onPress={() => onAction(need.route)}
            className="active:opacity-80"
            style={{ height: 32, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center' }}
          >
            <Text style={{ color: palette.text, fontSize: 12, fontWeight: '600' }}>{need.cta}</Text>
          </Pressable>
          <Pressable
            onPress={() => onDismiss(need.id)}
            accessibilityLabel="Mark as handled"
            className="active:opacity-70"
            style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' }}
          >
            <Check size={16} color={palette.faint} strokeWidth={2.4} />
          </Pressable>
        </HomeRow>
      ))}
    </HomeCard>
  );
}

// Mobile: swipeable compact cards so the list never takes over the screen.
// "See all" opens every item in a sheet.
export function NeedsYouCarousel({ needs, onAction, onDismiss, onRestore }: NeedsProps) {
  const palette = usePaymentsPalette();
  const { width } = useWindowDimensions();
  const [showAll, setShowAll] = useState<boolean>(false);
  const [page, setPage] = useState<number>(0);
  const cardWidth = Math.min(Math.max(width - 72, 240), 340);
  const gap = 12;

  const handleCarouselScroll = (offsetX: number) => {
    setPage(Math.max(0, Math.min(needs.length - 1, Math.round(offsetX / (cardWidth + gap)))));
  };

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(0, needs.length - 1)));
  }, [needs.length]);

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text style={{ color: palette.text, fontSize: 13, fontWeight: '600' }}>Needs you today</Text>
        <Text style={{ color: palette.faint, fontSize: 13 }}>{needs.length}</Text>
      </View>
      {needs.length > 1 ? (
        <Pressable onPress={() => setShowAll(true)} className="active:opacity-70" style={{ height: 30, justifyContent: 'center' }}>
          <Text style={{ color: palette.limeOnSurface, fontSize: 13, fontWeight: '600' }}>See all {needs.length}</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View>
      {header}
      {needs.length === 0 ? (
        <View style={{ marginHorizontal: 20, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, borderRadius: 18 }}>
          <AllCaught palette={palette} onRestore={onRestore} compact />
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={cardWidth + gap}
            decelerationRate="fast"
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 20, gap }}
            onScroll={(event) => handleCarouselScroll(event.nativeEvent.contentOffset.x)}
            scrollEventThrottle={16}
          >
            {needs.map((need) => (
              <View
                key={need.id}
                style={{ width: cardWidth, height: 156, backgroundColor: palette.card, borderWidth: 1, borderColor: palette.border, borderRadius: 18, padding: 14, gap: 12 }}
              >
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                  <NeedIcon need={need} size={38} palette={palette} />
                  <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                    <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600', lineHeight: 19 }} numberOfLines={2}>{need.title}</Text>
                    <Text style={{ color: palette.faint, fontSize: 12, lineHeight: 17 }} numberOfLines={2}>{need.body}</Text>
                  </View>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto' }}>
                  <Pressable
                    onPress={() => onAction(need.route)}
                    className="active:opacity-80"
                    style={{ height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: palette.text, fontSize: 12.5, fontWeight: '600' }}>{need.cta}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onDismiss(need.id)}
                    accessibilityLabel="Mark as handled"
                    className="active:opacity-70"
                    style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Check size={16} color={palette.faint} strokeWidth={2.4} />
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
          {needs.length > 1 ? (
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5, marginTop: 10 }}>
              {needs.map((need, index) => (
                <View key={`dot-${need.id}`} style={{ width: index === page ? 16 : 6, height: 6, borderRadius: 3, backgroundColor: index === page ? palette.limeOnSurface : palette.outline }} />
              ))}
            </View>
          ) : null}
        </>
      )}

      <Modal visible={showAll} animationType="slide" transparent onRequestClose={() => setShowAll(false)}>
        <Pressable onPress={() => setShowAll(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <Pressable
            onPress={(event) => event.stopPropagation()}
            style={{ maxHeight: '85%', backgroundColor: palette.isDark ? '#1A1A1A' : '#FFFFFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, borderWidth: 1, borderColor: palette.border, paddingBottom: Platform.OS === 'web' ? 16 : 30 }}
          >
            <View style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, backgroundColor: palette.outline, marginTop: 8 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 12, paddingBottom: 12 }}>
              <View style={{ gap: 2 }}>
                <Text style={{ color: palette.text, fontSize: 17, fontWeight: '700' }}>Needs you today</Text>
                <Text style={{ color: palette.faint, fontSize: 12.5 }}>{needs.length} {needs.length === 1 ? 'item' : 'items'} · most urgent first</Text>
              </View>
              <Pressable onPress={() => setShowAll(false)} accessibilityLabel="Close" className="active:opacity-70" style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: palette.softFill, alignItems: 'center', justifyContent: 'center' }}>
                <X size={16} color={palette.text} strokeWidth={2.4} />
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 8 }}>
              {needs.length === 0 ? (
                <AllCaught palette={palette} onRestore={() => { onRestore(); setShowAll(false); }} compact />
              ) : needs.map((need) => (
                <View key={need.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, borderTopWidth: 1, borderTopColor: palette.hairline }}>
                  <NeedIcon need={need} size={38} palette={palette} />
                  <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
                    <View style={{ gap: 2 }}>
                      <Text style={{ color: palette.text, fontSize: 14, fontWeight: '600', lineHeight: 19 }}>{need.title}</Text>
                      <Text style={{ color: palette.faint, fontSize: 12, lineHeight: 17 }}>{need.body}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <Pressable
                        onPress={() => { setShowAll(false); onAction(need.route); }}
                        className="active:opacity-80"
                        style={{ height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: palette.outline, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Text style={{ color: palette.text, fontSize: 12.5, fontWeight: '600' }}>{need.cta}</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => onDismiss(need.id)}
                        accessibilityLabel="Mark as handled"
                        className="active:opacity-70"
                        style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.isDark ? 'rgba(185,196,106,0.08)' : 'rgba(91,106,14,0.07)' }}
                      >
                        <Check size={13} color={palette.tones.verified.ink} strokeWidth={2.2} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export const useVisibleNeeds = (needs: HomeNeed[], dismissed: string[]) => (
  useMemo(() => needs.filter((need) => !dismissed.includes(need.id)), [needs, dismissed])
);
