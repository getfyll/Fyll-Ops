import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, G, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Upload } from 'lucide-react-native';
import {
  BricolageGrotesque_400Regular,
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/bricolage-grotesque';
import { formatMilestoneNumber, milestoneProgress } from '@/lib/milestones';
import { prepareLogoForCapture, shareMilestoneStory } from '@/lib/milestone-share';
import { MilestoneStoryCard, STORY_HEIGHT, STORY_WIDTH } from './MilestoneStoryCard';

const LIME = '#d5e057';
const INK = '#1e1e1e';

type Weight = 400 | 600 | 700 | 800;
const FONT_FAMILY: Record<Weight, string> = {
  400: 'BricolageGrotesque_400Regular',
  600: 'BricolageGrotesque_600SemiBold',
  700: 'BricolageGrotesque_700Bold',
  800: 'BricolageGrotesque_800ExtraBold',
};

// Fades and rises into place after `delay` ms (or simply shows when motion is reduced).
function FadeUp({ delay, reduced, style, children }: { delay: number; reduced: boolean; style?: object; children: React.ReactNode }) {
  const progress = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    progress.value = withDelay(delay, withTiming(1, { duration: 600, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }));
  }, [delay, progress, reduced]);
  const animated = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateY: (1 - progress.value) * 18 }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

// One piece of the single confetti burst from behind the medal.
function ConfettiBit({ x, y, r, w, h, radius, color }: { x: number; y: number; r: number; w: number; h: number; radius: number; color: string }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(250, withTiming(1, { duration: 1300, easing: Easing.bezier(0.15, 0.7, 0.3, 1) }));
  }, [progress]);
  const animated = useAnimatedStyle(() => ({
    opacity: 1 - progress.value,
    transform: [
      { translateX: x * progress.value },
      { translateY: y * progress.value },
      { rotate: `${r * progress.value}deg` },
      { scale: 0.5 + 0.5 * progress.value },
    ],
  }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: '50%', top: '50%', width: w, height: h, borderRadius: radius, backgroundColor: color }, animated]} />;
}

const BITS = [
  { x: -130, y: -110, r: 220, w: 10, h: 10, radius: 2, color: LIME },
  { x: 128, y: -120, r: -180, w: 8, h: 14, radius: 3, color: '#f4f4ef' },
  { x: -150, y: 30, r: 300, w: 12, h: 5, radius: 2, color: '#b9c46a' },
  { x: 150, y: 20, r: -260, w: 9, h: 9, radius: 5, color: LIME },
  { x: -90, y: 130, r: 160, w: 7, h: 12, radius: 3, color: LIME },
  { x: 95, y: 125, r: -140, w: 11, h: 11, radius: 2, color: '#f4f4ef' },
  { x: -20, y: -150, r: 90, w: 6, h: 6, radius: 3, color: '#f4f4ef' },
  { x: 40, y: 150, r: 200, w: 12, h: 4, radius: 2, color: '#b9c46a' },
  { x: -160, y: -40, r: -90, w: 6, h: 10, radius: 3, color: LIME },
  { x: 165, y: -50, r: 120, w: 8, h: 8, radius: 2, color: '#b9c46a' },
  { x: 60, y: -155, r: -240, w: 9, h: 4, radius: 2, color: LIME },
  { x: -60, y: 155, r: 280, w: 7, h: 7, radius: 4, color: LIME },
];

// Small specks that drift up the screen on a loop.
function Fleck({ left, top, w, h, radius, color, delay }: { left: number; top: number; w: number; h: number; radius: number; color: string; delay: number }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withRepeat(withTiming(1, { duration: 3400, easing: Easing.out(Easing.quad) }), -1, false));
    return () => cancelAnimation(progress);
  }, [delay, progress]);
  const animated = useAnimatedStyle(() => ({
    opacity: progress.value < 0.2 ? (progress.value / 0.2) * 0.9 : 0.9 * (1 - (progress.value - 0.2) / 0.8),
    transform: [{ translateY: -160 * progress.value }],
  }));
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', left, top, width: w, height: h, borderRadius: radius, backgroundColor: color }, animated]} />;
}

function Rays({ reduced }: { reduced: boolean }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    turn.value = withRepeat(withTiming(360, { duration: 24000, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [reduced, turn]);
  const animated = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value}deg` }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', width: 300, height: 300 }, animated]}>
      <Svg width={300} height={300} viewBox="0 0 300 300">
        <G stroke={LIME} strokeWidth={2} strokeLinecap="round" opacity={0.35}>
          <Path d="M150 8v34M150 258v34M8 150h34M258 150h34M49.6 49.6l24 24M226.4 226.4l24 24M49.6 250.4l24-24M226.4 73.6l24-24" />
        </G>
        <G stroke={LIME} strokeWidth={1.4} strokeLinecap="round" opacity={0.2}>
          <Path d="M95.6 18.6l13 31.4M191.4 250l13 31.4M18.6 204.4l31.4-13M250 108.6l31.4-13M204.4 18.6l-13 31.4M108.6 250l-13 31.4M18.6 95.6l31.4 13M250 191.4l31.4 13" />
        </G>
      </Svg>
    </Animated.View>
  );
}

function Halo({ reduced }: { reduced: boolean }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    pulse.value = withRepeat(withTiming(1, { duration: 2000, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [reduced, pulse]);
  const animated = useAnimatedStyle(() => ({ opacity: 0.55 + 0.35 * pulse.value, transform: [{ scale: 1 + 0.08 * pulse.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: '50%', top: 250, width: 520, height: 520, marginLeft: -260, marginTop: -260 }, animated]}>
      <Svg width={520} height={520}>
        <Defs>
          <RadialGradient id="milestoneHalo" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={LIME} stopOpacity={0.28} />
            <Stop offset="0.35" stopColor="#7d8a00" stopOpacity={0.12} />
            <Stop offset="0.68" stopColor="#141414" stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={520} height={520} fill="url(#milestoneHalo)" />
      </Svg>
    </Animated.View>
  );
}

// A soft band of light that sweeps across the number every few seconds.
function Shine({ reduced }: { reduced: boolean }) {
  const sweep = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    sweep.value = withDelay(
      1400,
      withRepeat(withSequence(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.quad) }), withDelay(1100, withTiming(0, { duration: 0 }))), -1, false),
    );
    return () => cancelAnimation(sweep);
  }, [reduced, sweep]);
  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: -170 + 340 * sweep.value }, { skewX: '-18deg' }], opacity: sweep.value === 0 ? 0 : 1 }));
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 60, marginLeft: -30 }, animated]}>
      <LinearGradient colors={['rgba(246,251,191,0)', 'rgba(246,251,191,0.35)', 'rgba(246,251,191,0)']} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
    </Animated.View>
  );
}

function ProgressBar({ target, reduced }: { target: number; reduced: boolean }) {
  const fill = useSharedValue(reduced ? target : 0);
  useEffect(() => {
    if (reduced) {
      fill.value = target;
      return;
    }
    fill.value = 0;
    fill.value = withDelay(1700, withTiming(target, { duration: 1200, easing: Easing.bezier(0.2, 0.8, 0.2, 1) }));
  }, [fill, reduced, target]);
  const animated = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View style={{ height: 8, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
      <Animated.View style={[{ height: '100%', borderRadius: 999, overflow: 'hidden' }, animated]}>
        <LinearGradient colors={['#7d8a00', LIME]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ flex: 1 }} />
      </Animated.View>
    </View>
  );
}

export interface MilestoneCelebrationProps {
  visible: boolean;
  businessName: string;
  businessLogo: string | null;
  storefrontUrl?: string | null;
  milestone: number;
  totalOrders: number;
  nextMilestone: number;
  onClose: () => void;
  onShared: () => void;
}

export function MilestoneCelebration({ visible, businessName, businessLogo, storefrontUrl, milestone, totalOrders, nextMilestone, onClose, onShared }: MilestoneCelebrationProps) {
  const reduced = useReducedMotion();
  const { width, height } = useWindowDimensions();
  const [fontsLoaded] = useFonts({
    BricolageGrotesque_400Regular,
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
  });
  const font = useCallback(
    (weight: Weight) => (fontsLoaded ? ({ fontFamily: FONT_FAMILY[weight], fontWeight: '400' } as const) : ({ fontWeight: String(weight) } as never)),
    [fontsLoaded],
  );

  // Tapping the medal replays everything: remounting the animated part restarts every animation.
  const [playKey, setPlayKey] = useState(0);
  const [shown, setShown] = useState(reduced ? milestone : 0);
  useEffect(() => {
    if (!visible) return;
    if (reduced) {
      setShown(milestone);
      return;
    }
    setShown(0);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const p = Math.min(1, (Date.now() - startedAt - 350) / 1300);
      const eased = p <= 0 ? 0 : 1 - Math.pow(1 - p, 3);
      setShown(Math.round(milestone * eased));
      if (p >= 1) clearInterval(timer);
    }, 30);
    return () => clearInterval(timer);
  }, [visible, reduced, milestone, playKey]);

  const medalScale = useSharedValue(reduced ? 1 : 0.4);
  const medalTurn = useSharedValue(reduced ? 0 : -40);
  const medalOpacity = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!visible) return;
    if (reduced) {
      medalScale.value = 1;
      medalTurn.value = 0;
      medalOpacity.value = 1;
      return;
    }
    medalScale.value = 0.4;
    medalTurn.value = -40;
    medalOpacity.value = 0;
    medalOpacity.value = withTiming(1, { duration: 300 });
    medalScale.value = withSequence(withTiming(1.08, { duration: 540, easing: Easing.out(Easing.cubic) }), withTiming(0.97, { duration: 180 }), withTiming(1, { duration: 180 }));
    medalTurn.value = withSequence(withTiming(6, { duration: 540, easing: Easing.out(Easing.cubic) }), withTiming(-2, { duration: 180 }), withTiming(0, { duration: 180 }));
  }, [visible, reduced, playKey, medalScale, medalTurn, medalOpacity]);
  const medalStyle = useAnimatedStyle(() => ({
    opacity: medalOpacity.value,
    transform: [{ scale: medalScale.value }, { rotate: `${medalTurn.value}deg` }],
  }));

  // Share to Story: the 1080x1920 card is drawn off-screen and captured as an image.
  const storyRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [captureLogo, setCaptureLogo] = useState<string | null>(businessLogo);
  useEffect(() => {
    let cancelled = false;
    void prepareLogoForCapture(businessLogo).then((logo) => {
      if (!cancelled) setCaptureLogo(logo);
    });
    return () => {
      cancelled = true;
    };
  }, [businessLogo]);

  const handleShare = async () => {
    if (sharing || !storyRef.current) return;
    setSharing(true);
    setShareError(null);
    try {
      const done = await shareMilestoneStory(storyRef.current, {
        businessName,
        businessLogo: captureLogo,
        milestone,
        dateLabel: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
        storefrontUrl,
      });
      if (done) onShared();
    } catch (error) {
      console.warn('Could not share the milestone Story:', error);
      setShareError('Could not create the Story image. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  const columnWidth = Math.min(width, 440);
  const progress = milestoneProgress(totalOrders, nextMilestone);
  const remaining = Math.max(0, nextMilestone - totalOrders);
  const numberText = formatMilestoneNumber(shown);
  const numberSize = formatMilestoneNumber(milestone).length > 4 ? 52 : 72;
  const dateLabel = new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const orderWord = totalOrders === 1 ? 'order' : 'orders';

  if (!visible) return null;

  return (
    <Modal visible transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#141414', alignItems: 'center' }}>
        <View style={{ width: columnWidth, height: Math.max(height, 640), overflow: 'hidden' }}>
          <Halo reduced={reduced} />

          {!reduced ? (
            <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
              <Fleck left={40} top={520} w={7} h={7} radius={2} color={LIME} delay={1600} />
              <Fleck left={columnWidth - 60} top={480} w={6} h={6} radius={3} color="#f4f4ef" delay={2200} />
              <Fleck left={columnWidth - 90} top={560} w={5} h={12} radius={3} color="#b9c46a" delay={2900} />
              <Fleck left={70} top={440} w={10} h={4} radius={2} color={LIME} delay={3400} />
            </View>
          ) : null}

          <View style={{ paddingTop: Platform.OS === 'web' ? 36 : 56, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <FadeUp delay={900} reduced={reduced}>
              <View style={{ height: 30, paddingHorizontal: 13, borderRadius: 999, backgroundColor: 'rgba(213,224,87,0.14)', borderWidth: 1, borderColor: 'rgba(213,224,87,0.35)', justifyContent: 'center' }}>
                <Text style={[{ color: LIME, fontSize: 12, letterSpacing: 1.4 }, font(700)]}>MILESTONE UNLOCKED</Text>
              </View>
            </FadeUp>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close" style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' }}>
              <X size={16} color="#f4f4ef" strokeWidth={2.4} />
            </Pressable>
          </View>

          <View key={playKey} style={{ height: 300, marginTop: 14, alignItems: 'center', justifyContent: 'center' }}>
            <Rays reduced={reduced} />
            {!reduced ? BITS.map((bit, index) => <ConfettiBit key={index} {...bit} />) : null}
            <Pressable onPress={() => setPlayKey((key) => key + 1)} accessibilityRole="button" accessibilityLabel="Play the celebration again">
              <Animated.View style={[{ width: 210, height: 210, borderRadius: 105, padding: 6, backgroundColor: LIME, shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 35, shadowOffset: { width: 0, height: 30 } }, medalStyle]}>
                <LinearGradient colors={[LIME, '#7d8a00', LIME, '#f6fbbf']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderRadius: 105 }} />
                <View style={{ flex: 1, borderRadius: 99, backgroundColor: '#1c1e12', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                  <Text style={[{ color: LIME, fontSize: numberSize, letterSpacing: -3, fontVariant: ['tabular-nums'] }, font(800)]}>{numberText}</Text>
                  <Text style={[{ color: '#d5d6cc', fontSize: 15, letterSpacing: 3 }, font(600)]}>ORDERS</Text>
                  <Shine reduced={reduced} />
                </View>
              </Animated.View>
            </Pressable>
          </View>

          <View style={{ paddingTop: 6, paddingHorizontal: 28, alignItems: 'center', gap: 8 }}>
            <FadeUp delay={1100} reduced={reduced}>
              <Text style={[{ color: '#f4f4ef', fontSize: 30, letterSpacing: -1, lineHeight: 33, textAlign: 'center' }, font(800)]}>You did it, {businessName}</Text>
            </FadeUp>
            <FadeUp delay={1250} reduced={reduced}>
              <Text style={[{ color: '#b9bab0', fontSize: 16, lineHeight: 24, textAlign: 'center', maxWidth: 310 }, font(400)]}>
                {formatMilestoneNumber(milestone)} {orderWord} on Fyll. That's {formatMilestoneNumber(milestone)} people who chose you.
              </Text>
            </FadeUp>
          </View>

          <FadeUp delay={1400} reduced={reduced} style={{ marginTop: 26, marginHorizontal: 20 }}>
            <View style={{ padding: 18, paddingVertical: 16, borderRadius: 20, backgroundColor: 'rgba(30,30,30,0.85)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[{ color: '#9d9e94', fontSize: 14 }, font(400)]}>Next milestone</Text>
                <Text style={[{ color: '#f4f4ef', fontSize: 14 }, font(700)]}>{formatMilestoneNumber(nextMilestone)} orders</Text>
              </View>
              <ProgressBar target={progress} reduced={reduced} />
              <Text style={[{ color: '#8c8d84', fontSize: 13 }, font(400)]}>
                {formatMilestoneNumber(totalOrders)} so far · {formatMilestoneNumber(remaining)} to go
              </Text>
            </View>
          </FadeUp>

          <FadeUp delay={1600} reduced={reduced} style={{ position: 'absolute', left: 20, right: 20, bottom: 36, gap: 10 }}>
            {shareError ? <Text style={[{ color: '#ff7a6b', fontSize: 13, textAlign: 'center' }, font(600)]}>{shareError}</Text> : null}
            <Pressable
              onPress={handleShare}
              disabled={sharing}
              accessibilityRole="button"
              style={({ pressed }) => ({ height: 56, borderRadius: 999, backgroundColor: LIME, opacity: pressed || sharing ? 0.85 : 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, shadowColor: LIME, shadowOpacity: 0.28, shadowRadius: 24, shadowOffset: { width: 0, height: 8 } })}
            >
              {sharing ? <ActivityIndicator size="small" color={INK} /> : <Upload size={18} color={INK} strokeWidth={2.3} />}
              <Text style={[{ color: INK, fontSize: 17 }, font(700)]}>Share to Story</Text>
            </Pressable>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={({ pressed }) => ({ height: 48, borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={[{ color: '#f4f4ef', fontSize: 15 }, font(600)]}>Back to Home</Text>
            </Pressable>
          </FadeUp>
        </View>

        {/* The shareable card, drawn off-screen at full size and captured when "Share to Story" is pressed. */}
        <View pointerEvents="none" style={{ position: 'absolute', left: -(STORY_WIDTH + 200), top: 0, width: STORY_WIDTH, height: STORY_HEIGHT }}>
          <View ref={storyRef} collapsable={false} style={{ width: STORY_WIDTH, height: STORY_HEIGHT }}>
            <MilestoneStoryCard businessName={businessName} businessLogo={captureLogo} milestone={milestone} dateLabel={dateLabel} storefrontUrl={storefrontUrl} fontsReady={fontsLoaded} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
