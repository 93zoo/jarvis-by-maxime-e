/**
 * IntroCinematic — Forge-themed title screen shown on first launch.
 *
 * Single full-screen composition:
 *   · Warm amber fire glow rising from the bottom
 *   · Floating ember/spark particles drifting upward
 *   · Anvil + hammer icon reveal
 *   · "FORGE & KINGDOMS" title with gold shimmer
 *   · "Jeux éducatif crée par Maxime-E" credit
 *   · Pulsing tap-to-start hint
 *
 * Uses only Reanimated v4 + React Native Animated — no extra deps.
 */
import React, { useEffect } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from '@/lib/LinearGradientSafe';
import { StatusBar } from 'expo-status-bar';
import Feather from '@/components/Feather';

const { width: W, height: H } = Dimensions.get('window');

// ─── Ember / spark particles ──────────────────────────────────────────────────
// Each particle rises from a fire zone at the bottom center of the screen.
const EMBER_COUNT = 44;
const embers = Array.from({ length: EMBER_COUNT }, (_, i) => ({
  id: i,
  // Spread across ~60 % of screen width, centred
  startX: W * 0.2 + Math.random() * W * 0.6,
  // Horizontal drift during rise
  driftX: (Math.random() - 0.5) * 90,
  // Rise distance (px)
  riseH: H * 0.45 + Math.random() * H * 0.3,
  // Timing
  delay: Math.random() * 2400,
  duration: 1800 + Math.random() * 1800,
  // Visual
  size: 1.5 + Math.random() * 3.5,
  opacity: 0.3 + Math.random() * 0.65,
  color: Math.random() > 0.5 ? '#FF8800' : '#FFCC44',
}));

// Sub-component — must be defined BEFORE the screen component (Hermes hoisting rule)
function EmberParticle({
  startX, driftX, riseH, delay, duration, size, opacity, color,
}: (typeof embers)[0]) {
  const y    = useSharedValue(0);
  const x    = useSharedValue(0);
  const op   = useSharedValue(0);

  useEffect(() => {
    const loop = withRepeat(
      withSequence(
        // Reset instantly, then rise while fading in then out
        withTiming(0, { duration: 0 }),
        withTiming(-riseH, { duration, easing: Easing.out(Easing.quad) }),
      ),
      -1,
    );
    const loopX = withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(driftX, { duration, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
    const loopOp = withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withTiming(opacity, { duration: duration * 0.25, easing: Easing.out(Easing.quad) }),
        withTiming(opacity * 0.6, { duration: duration * 0.5 }),
        withTiming(0, { duration: duration * 0.25 }),
      ),
      -1,
    );
    y.value  = withDelay(delay, loop);
    x.value  = withDelay(delay, loopX);
    op.value = withDelay(delay, loopOp);
  }, []);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
    opacity: op.value,
  }));

  return (
    <Animated.View
      style={[
        styles.ember,
        style,
        { left: startX, width: size, height: size * 2.5, borderRadius: size, backgroundColor: color },
      ]}
    />
  );
}

// ─── Fire glow (pulsing radial blob at the bottom) ───────────────────────────
function FireGlow({ visible }: { visible: boolean }) {
  const scale = useSharedValue(0.6);
  const op    = useSharedValue(0);

  useEffect(() => {
    op.value = withDelay(200, withTiming(1, { duration: 900 }));
    scale.value = withDelay(
      200,
      withRepeat(
        withSequence(
          withTiming(1.05, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.92, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ scaleX: scale.value }, { scaleY: scale.value * 0.7 }],
  }));

  if (!visible) return null;
  return (
    <Animated.View style={[styles.fireGlowWrap, style]}>
      <View style={styles.fireGlowInner} />
      <View style={styles.fireGlowOuter} />
    </Animated.View>
  );
}

// ─── Animated divider line (scales in from centre) ───────────────────────────
function GoldDivider({ delay }: { delay: number }) {
  const scaleX = useSharedValue(0);
  const op     = useSharedValue(0);

  useEffect(() => {
    op.value     = withDelay(delay, withTiming(1, { duration: 400 }));
    scaleX.value = withDelay(delay, withTiming(1, { duration: 600, easing: Easing.out(Easing.back(1.5)) }));
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ scaleX: scaleX.value }],
  }));

  return <Animated.View style={[styles.divider, style]} />;
}

// ─── Fade + slide text block ──────────────────────────────────────────────────
function FadeText({
  delay, children, style: textStyle,
}: { delay: number; children: React.ReactNode; style?: object }) {
  const op  = useSharedValue(0);
  const tY  = useSharedValue(18);

  useEffect(() => {
    op.value = withDelay(delay, withTiming(1, { duration: 650, easing: Easing.out(Easing.cubic) }));
    tY.value = withDelay(delay, withTiming(0, { duration: 650, easing: Easing.out(Easing.cubic) }));
  }, []);

  const aStyle = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ translateY: tY.value }],
  }));

  return (
    <Animated.Text style={[aStyle, textStyle]}>
      {children}
    </Animated.Text>
  );
}

// ─── Forge icon reveal — scale + glow bounce ─────────────────────────────────
function ForgeIcon({ delay }: { delay: number }) {
  const scale = useSharedValue(0.2);
  const op    = useSharedValue(0);
  const rot   = useSharedValue(-15);

  useEffect(() => {
    op.value    = withDelay(delay, withTiming(1, { duration: 400 }));
    scale.value = withDelay(delay, withTiming(1, { duration: 700, easing: Easing.out(Easing.back(1.8)) }));
    rot.value   = withDelay(delay, withTiming(0,  { duration: 700, easing: Easing.out(Easing.back(1.2)) }));
    // Gentle idle float after reveal
    setTimeout(() => {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.97, { duration: 1400, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
      );
    }, delay + 800);
  }, []);

  const style = useAnimatedStyle(() => ({
    opacity: op.value,
    transform: [{ scale: scale.value }, { rotate: `${rot.value}deg` }],
  }));

  return (
    <Animated.View style={[styles.iconWrap, style]}>
      <Feather name="tool" size={48} color="#D4851A" />
      {/* Inner glow ring */}
      <View style={styles.iconGlow} />
    </Animated.View>
  );
}

// ─── Pulsing CTA ─────────────────────────────────────────────────────────────
function TapToContinue({ delay }: { delay: number }) {
  const op = useSharedValue(0);

  useEffect(() => {
    op.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1,   { duration: 700 }),
          withTiming(0.3, { duration: 700 }),
        ),
        -1,
      ),
    );
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: op.value }));

  return (
    <Animated.Text style={[styles.ctaText, style]}>
      Appuyer pour commencer
    </Animated.Text>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props { onFinish: () => void; }

export default function IntroCinematic({ onFinish }: Props) {
  const rootOp = useSharedValue(1);

  const doFinish = () => {
    rootOp.value = withTiming(0, { duration: 600, easing: Easing.in(Easing.cubic) });
    setTimeout(onFinish, 640);
  };

  // Auto-advance after 7 s
  useEffect(() => {
    const t = setTimeout(doFinish, 7000);
    return () => clearTimeout(t);
  }, []);

  const rootStyle = useAnimatedStyle(() => ({ opacity: rootOp.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]}>
      <StatusBar style="light" />

      {/* ── Background gradient — dark at top, warm amber fire at bottom ── */}
      <LinearGradient
        colors={['#040208', '#0D0608', '#1A0804', '#3A1400']}
        locations={[0, 0.35, 0.72, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Ember particles — always rendering */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {embers.map((e) => <EmberParticle key={e.id} {...e} />)}
      </View>

      {/* Fire glow blob at bottom */}
      <View style={styles.fireGlowContainer} pointerEvents="none">
        <FireGlow visible />
      </View>

      {/* ── Central content ── */}
      <View style={styles.centerContent} pointerEvents="none">

        {/* Forge icon */}
        <ForgeIcon delay={400} />

        {/* Title */}
        <FadeText delay={900} style={styles.title}>
          FORGE &amp; KINGDOMS
        </FadeText>

        {/* Gold divider */}
        <GoldDivider delay={1300} />

        {/* Tagline */}
        <FadeText delay={1500} style={styles.tagline}>
          Rallumez la flamme. Forgez votre légende.
        </FadeText>

      </View>

      {/* ── Credit line — bottom of screen ── */}
      <View style={styles.creditWrap} pointerEvents="none">
        <FadeText delay={2200} style={styles.creditText}>
          Jeux éducatif crée par Maxime-E
        </FadeText>
      </View>

      {/* ── CTA ── */}
      <View style={styles.ctaWrap} pointerEvents="none">
        <TapToContinue delay={2800} />
      </View>

      {/* Full-screen tap to start */}
      <Pressable style={StyleSheet.absoluteFill} onPress={doFinish} />

      {/* Skip button */}
      <Pressable style={styles.skipBtn} onPress={doFinish}>
        <Text style={styles.skipText}>Passer ›</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    zIndex: 1000,
    backgroundColor: '#040208',
  },

  // Embers
  ember: {
    position: 'absolute',
    bottom: H * 0.12,
  },

  // Fire glow
  fireGlowContainer: {
    position: 'absolute',
    bottom: -60,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fireGlowWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  fireGlowOuter: {
    width: W * 0.95,
    height: 220,
    borderRadius: W * 0.475,
    backgroundColor: '#FF440014',
  },
  fireGlowInner: {
    position: 'absolute',
    width: W * 0.55,
    height: 140,
    borderRadius: W * 0.275,
    backgroundColor: '#FF660028',
  },

  // Center block
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    paddingHorizontal: 28,
    paddingBottom: 40,
  },

  // Forge icon
  iconWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  iconEmoji: {
    fontSize: 80,
    lineHeight: 90,
    textAlign: 'center',
  },
  iconGlow: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FF660018',
  },

  // Title
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: '#E8A83A',
    textAlign: 'center',
    letterSpacing: 4,
    textShadowColor: '#FF880055',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },

  // Divider
  divider: {
    width: 100,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#D4851A',
    opacity: 0.7,
    marginVertical: 2,
  },

  // Tagline
  tagline: {
    fontSize: 14,
    color: '#B08A60',
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: 0.8,
    fontStyle: 'italic',
  },

  // Credit
  creditWrap: {
    position: 'absolute',
    bottom: 90,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  creditText: {
    fontSize: 11,
    color: '#7A6A50',
    letterSpacing: 1.2,
    textAlign: 'center',
  },

  // CTA
  ctaWrap: {
    position: 'absolute',
    bottom: 58,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 12,
    color: '#D4851A',
    letterSpacing: 2,
    textAlign: 'center',
  },

  // Skip
  skipBtn: {
    position: 'absolute',
    top: 52,
    right: 24,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  skipText: {
    fontSize: 12,
    color: '#7A6A50',
    letterSpacing: 1,
  },
});
