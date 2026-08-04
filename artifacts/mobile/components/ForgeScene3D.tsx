/**
 * ForgeScene — Ultra-realistic animated smithy interior.
 * Pure React Native Animated (no WebGL). Works on all Android / iOS devices.
 *
 * Architecture rules (never break these):
 *  • useNativeDriver: true  → transform, opacity only
 *  • useNativeDriver: false → backgroundColor, shadowColor (any color/layout prop)
 *  • NEVER mix the two inside the same Animated.parallel / Animated.sequence
 */
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Easing, LayoutChangeEvent, Platform, StyleSheet, View } from 'react-native';
import { LinearGradient } from '@/lib/LinearGradientSafe';
import AudioManager from '@/utils/AudioManager';
import Constants from 'expo-constants';

// ForgeScene3D has many simultaneous Animated.loop() calls (flicker + sparks + smoke).
// Combined with ForgeBackdrop this exceeds Android's native thread limit in Expo Go.
// Return null in Expo Go — ForgeBackdrop (static image) is still shown.
const IS_EXPO_GO =
  Platform.OS !== 'web' &&
  ((Constants.appOwnership as string) === 'expo' ||
    Constants.executionEnvironment === 'storeClient');

// ─── Public types (kept for parent compatibility) ────────────────────────────
export type CraftPhase = 'IDLE' | 'HEATING' | 'HAMMERING' | 'COOLING' | 'RESULT';
export interface ForgeScene3DRef { triggerHammerStrike: () => void; }
interface Props { craftPhase: CraftPhase; upgradeLevel?: number; }

// ─── Helpers ─────────────────────────────────────────────────────────────────
/** Run an infinite flicker loop on a single Animated.Value. Returns stop fn. */
function startFlicker(
  val: Animated.Value,
  steps: [number, number][],   // [toValue, duration][]
): () => void {
  const loop = Animated.loop(
    Animated.sequence(
      steps.map(([toValue, duration]) =>
        Animated.timing(val, { toValue, duration, useNativeDriver: true, easing: Easing.inOut(Easing.sin) }),
      ),
    ),
  );
  loop.start();
  return () => loop.stop();
}

// ─── Spark particle ───────────────────────────────────────────────────────────
interface SparkSeed {
  id: number;
  ox: number; oy: number;   // spawn position (absolute px)
  dx: number; dy: number;   // displacement over lifetime
  dur: number; delay: number;
  size: number; color: string;
}

function Spark({ ox, oy, dx, dy, dur, delay, size, color }: SparkSeed) {
  const prog = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(prog, { toValue: 1, duration: dur, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(prog, { toValue: 0, duration: 0,   useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const tx      = prog.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
  const ty      = prog.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });
  const opacity = prog.interpolate({ inputRange: [0, 0.06, 0.7, 1], outputRange: [0, 1, 0.7, 0] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: ox - size / 2,
        top:  oy - size / 2,
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateX: tx }, { translateY: ty }],
      }}
    />
  );
}

// ─── Strike burst sparks (on anvil hammer hit) ────────────────────────────────
interface StrikeSeed { id: number; dx: number; dy: number; color: string }

function StrikeSpark({
  dx, dy, color, triggerAnim,
  ox, oy,
}: StrikeSeed & { triggerAnim: Animated.Value; ox: number; oy: number }) {
  const prog    = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const id = triggerAnim.addListener(({ value }) => {
      if (value < 0.05) {
        prog.setValue(0); opacity.setValue(0);
        Animated.parallel([
          Animated.timing(prog,    { toValue: 1, duration: 500, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
          Animated.sequence([
            Animated.timing(opacity, { toValue: 1, duration: 60,  useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 440, useNativeDriver: true }),
          ]),
        ]).start();
      }
    });
    return () => triggerAnim.removeListener(id);
  }, []);

  const tx = prog.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
  const ty = prog.interpolate({ inputRange: [0, 1], outputRange: [0, dy] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: ox - 3, top: oy - 3,
        width: 6, height: 6, borderRadius: 3,
        backgroundColor: color,
        opacity,
        transform: [{ translateX: tx }, { translateY: ty }],
      }}
    />
  );
}

// ─── Smoke wisp ───────────────────────────────────────────────────────────────
interface SmokeSeed { id: number; ox: number; oy: number; dx: number; delay: number; size: number }

function SmokeWisp({ ox, oy, dx, delay, size }: SmokeSeed) {
  const prog = useRef(new Animated.Value(0)).current;
  const dur  = useMemo(() => 2800 + Math.random() * 2200, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(prog, { toValue: 1, duration: dur, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
        Animated.timing(prog, { toValue: 0, duration: 0,   useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const ty      = prog.interpolate({ inputRange: [0, 1], outputRange: [0, -(size * 3 + 60)] });
  const tx      = prog.interpolate({ inputRange: [0, 1], outputRange: [0, dx] });
  const scale   = prog.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.6] });
  const opacity = prog.interpolate({ inputRange: [0, 0.08, 0.6, 1], outputRange: [0, 0.14, 0.08, 0] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: ox - size / 2, top: oy - size / 2,
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: '#5A4830',
        opacity,
        transform: [{ translateX: tx }, { translateY: ty }, { scale }],
      }}
    />
  );
}

// ─── Fire layer ───────────────────────────────────────────────────────────────
/** A single elliptical glow layer, bottom-anchored at (cx, cy), rising upward. */
function FireLayer({
  cx, cy, w, h, color, flicker, phaseScale, opacity,
}: {
  cx: number; cy: number;
  w: number; h: number;
  color: string;
  // Animated.multiply returns an Animated node rather than a plain Value.
  // Keep these props broad enough for composed native-driver animations.
  flicker: any;
  phaseScale: any;
  opacity: number;
}) {
  const combinedScale = Animated.multiply(flicker, phaseScale);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: cx - w / 2,
        top:  cy - h,
        width: w, height: h,
        borderRadius: w / 2,
        backgroundColor: color,
        opacity,
        transform: [
          { translateY: h / 2 },          // anchor to bottom
          { scaleX: combinedScale },
          { scaleY: combinedScale },
          { translateY: -h / 2 },
        ],
      }}
      pointerEvents="none"
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
const ForgeScene3D = forwardRef<ForgeScene3DRef, Props>(
  ({ craftPhase, upgradeLevel = 0 }, ref) => {
    // Expo Go: no-op ref + null render — ForgeBackdrop already shows the static image.
    // IS_EXPO_GO is a module-level constant, so hook order stays consistent.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useImperativeHandle(ref, () => ({ triggerHammerStrike: () => {} }));
    if (IS_EXPO_GO) return null;

    // ── Layout measurement ──────────────────────────────────────────────────
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [dims, setDims] = useState({ w: 390, h: 280 });
    const onLayout = (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      if (width > 0 && height > 0) setDims({ w: width, h: height });
    };

    const { w, h } = dims;

    // Anchor points (fractional)
    const fireCX  = w * 0.50;
    const fireCY  = h * 0.64;   // fire origin (base of flame = forge opening)
    const chimneyX = w * 0.50;
    const chimneyY = h * 0.08;
    const anvilCX = w * 0.74;
    const anvilCY = h * 0.66;

    // ── 3 independent flicker oscillators (prime-period for no sync) ────────
    const flk1 = useRef(new Animated.Value(1)).current;
    const flk2 = useRef(new Animated.Value(1)).current;
    const flk3 = useRef(new Animated.Value(1)).current;

    useEffect(() => {
      const s1 = startFlicker(flk1, [
        [1.14, 90], [0.92, 70], [1.09, 110], [0.96, 60], [1.06, 130], [1.0, 80],
      ]);
      const s2 = startFlicker(flk2, [
        [0.95, 110], [1.12, 90], [0.98, 130], [1.08, 70], [0.93, 100], [1.0, 110],
      ]);
      const s3 = startFlicker(flk3, [
        [1.07, 137], [0.94, 83], [1.11, 110], [0.97, 93], [1.05, 127], [0.99, 97],
      ]);
      return () => { s1(); s2(); s3(); };
    }, []);

    // Combine flickers for each layer (different combinations = unique rhythm)
    const flkA = Animated.multiply(flk1, flk2);
    const flkB = Animated.multiply(flk2, flk3);
    const flkC = Animated.multiply(flk1, flk3);
    const flkD = Animated.multiply(flkA, new Animated.Value(1));  // same as flkA
    const flkE = flk1;
    const flkF = flk2;
    const flkG = flk3;

    // ── Phase → fire scale (native driver) ─────────────────────────────────
    const fireScale = useRef(new Animated.Value(1)).current;

    // Non-linear boost table: each upgrade level visibly grows the fire.
    // L0: +0   L1: +0.06  L2: +0.14  L3: +0.26  L4: +0.40  L5+: +0.55
    const BOOST_TABLE = [0, 0.06, 0.14, 0.26, 0.40, 0.55];
    const heatBoost = BOOST_TABLE[Math.min(upgradeLevel, BOOST_TABLE.length - 1)];

    useEffect(() => {
      const target =
        craftPhase === 'HEATING'   ? 1.55 + heatBoost :
        craftPhase === 'HAMMERING' ? 1.20 + heatBoost :
        craftPhase === 'COOLING'   ? 0.65 + heatBoost :
        craftPhase === 'RESULT'    ? 1.70 + heatBoost : 1.0 + heatBoost;
      Animated.timing(fireScale, { toValue: target, duration: 700, useNativeDriver: true, easing: Easing.out(Easing.cubic) }).start();
    }, [craftPhase, upgradeLevel]);

    const phaseScaleA = Animated.multiply(flkA, fireScale);
    const phaseScaleB = Animated.multiply(flkB, fireScale);
    const phaseScaleC = Animated.multiply(flkC, fireScale);
    const phaseScaleD = Animated.multiply(flkD, fireScale);
    const phaseScaleE = Animated.multiply(flkE, fireScale);
    const phaseScaleF = Animated.multiply(flkF, fireScale);
    const phaseScaleG = Animated.multiply(flkG, fireScale);

    // ── Phase → ambient glow opacity (native driver → opacity is supported) ─
    const ambientOpacity = useRef(new Animated.Value(0.5)).current;

    useEffect(() => {
      const target =
        craftPhase === 'HEATING'   ? 1.0 :
        craftPhase === 'HAMMERING' ? 0.85 :
        craftPhase === 'COOLING'   ? 0.25 :
        craftPhase === 'RESULT'    ? 1.0 : 0.5;
      Animated.timing(ambientOpacity, { toValue: target, duration: 700, useNativeDriver: true }).start();
    }, [craftPhase]);

    // ── Metal glow on anvil (JS driver — backgroundColor interpolation) ─────
    const metalGlow  = useRef(new Animated.Value(0)).current;
    const coolBlue   = useRef(new Animated.Value(0)).current;
    const anvilFlash = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      const metal = craftPhase === 'HEATING' ? 0.8 : craftPhase === 'HAMMERING' ? 1.0 : 0;
      const cool  = craftPhase === 'COOLING' ? 1 : 0;
      // JS driver only — no transform, just color
      Animated.parallel([
        Animated.timing(metalGlow, { toValue: metal, duration: 500, useNativeDriver: false }),
        Animated.timing(coolBlue,  { toValue: cool,  duration: 900, useNativeDriver: false }),
      ]).start();
    }, [craftPhase]);

    // ── Hammer strike ───────────────────────────────────────────────────────
    const triggerAnim = useRef(new Animated.Value(1)).current;

    useImperativeHandle(ref, () => ({
      triggerHammerStrike: () => {
        triggerAnim.setValue(0);
        Animated.timing(triggerAnim, { toValue: 1, duration: 20, useNativeDriver: true }).start();
        // Flash via opacity — native driver (no JS-thread block on tap)
        anvilFlash.setValue(1);
        Animated.timing(anvilFlash, { toValue: 0, duration: 320, useNativeDriver: true }).start();
      },
    }));

    // ── Forge ambience ──────────────────────────────────────────────────────
    useEffect(() => {
      AudioManager.startForgeAmbience();
      return () => AudioManager.stopForgeAmbience();
    }, []);

    // ── Spark seeds ─────────────────────────────────────────────────────────
    // Spark count and intensity scale with upgrade level.
    // L0: 20 sparks  L3: 35  L5+: 50
    const sparkCount = 20 + Math.min(upgradeLevel * 6, 30);
    const sparkSizeScale = 1 + upgradeLevel * 0.07; // up to ~1.35× at L5

    const ambientSparks = useMemo<SparkSeed[]>(() =>
      Array.from({ length: sparkCount }, (_, i) => {
        const angle = (Math.random() - 0.5) * Math.PI * (0.9 + upgradeLevel * 0.04);
        const speed = 80 + Math.random() * (180 + upgradeLevel * 20);
        const cat   = i % 3;
        // At higher levels, more sparks in the bright/white category
        const colorCat = upgradeLevel >= 3 ? (i % 4 === 3 ? 2 : cat) : cat;
        return {
          id: i,
          ox: fireCX + (Math.random() - 0.5) * (40 + upgradeLevel * 4),
          oy: fireCY - 10,
          dx: Math.sin(angle) * speed,
          dy: -(Math.cos(angle) * speed + 40 + upgradeLevel * 8),
          dur: cat === 0 ? 500 + Math.random() * 400
             : cat === 1 ? 800 + Math.random() * 600
             :              1200 + Math.random() * 800,
          delay: i * 100 + Math.random() * 300,
          size:  (colorCat === 0 ? 2.5 : colorCat === 1 ? 3.5 : 4.5) * sparkSizeScale,
          color: upgradeLevel >= 3
            ? (colorCat === 0 ? '#FFFFFF'
              : colorCat === 1 ? '#FFFFFF'
              :                  '#FFAA00')
            : (colorCat === 0 ? '#FFFFFF'
              : colorCat === 1 ? '#FFEE55'
              :                  '#FF8800'),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fireCX, fireCY, upgradeLevel]);

    const strikeSparks = useMemo<(StrikeSeed & { ox: number; oy: number })[]>(() =>
      Array.from({ length: 22 }, (_, i) => {
        const angle = (Math.random() - 0.5) * Math.PI * 1.4;
        const spd   = 60 + Math.random() * 130;
        return {
          id: i,
          ox: anvilCX + (Math.random() - 0.5) * 24,
          oy: anvilCY - 18,
          dx: Math.sin(angle) * spd,
          dy: -(Math.cos(angle) * spd + 20),
          color: i % 2 === 0 ? '#FFEE44' : '#FFFFFF',
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anvilCX, anvilCY]);

    const smokeWisps = useMemo<SmokeSeed[]>(() =>
      Array.from({ length: 7 }, (_, i) => ({
        id: i,
        ox: chimneyX + (Math.random() - 0.5) * 30,
        oy: chimneyY,
        dx: (Math.random() - 0.5) * 70,
        delay: i * 450,
        size: 36 + Math.random() * 32,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chimneyX, chimneyY]);

    // ── Forge structure geometry ─────────────────────────────────────────────
    const archW   = w * 0.44;
    const archH   = h * 0.42;
    const archX   = (w - archW) / 2;
    const archY   = fireCY - archH + h * 0.08;
    const openW   = archW * 0.55;
    const openH   = archH * 0.50;
    const openX   = (w - openW) / 2;
    const openY   = fireCY - openH;

    return (
      <View style={styles.container} onLayout={onLayout}>

        {/* ── 1. Deep background ─────────────────────────────────────────── */}
        <LinearGradient
          colors={['#080402', '#0E0806', '#110A05']}
          style={StyleSheet.absoluteFill}
        />

        {/* ── 2. Warm ambient from fire (full-scene glow) ────────────────── */}
        <Animated.View
          style={[styles.sceneGlow, { opacity: ambientOpacity }]}
          pointerEvents="none"
        />

        {/* ── 3. Stone side walls ──────────────────────────────────────────── */}
        <View style={[styles.wallLeft,  { height: h, backgroundColor: '#0D0A07' }]} />
        <View style={[styles.wallRight, { height: h, backgroundColor: '#0D0A07' }]} />
        {/* Wall stone blocks (subtle texture) */}
        {[0,1,2,3,4,5].map(r =>
          [0,1].map(c => (
            <View
              key={`wl${r}${c}`}
              style={{
                position: 'absolute',
                left: c * 22 + 2,
                top: r * 44 + (c % 2) * 22 + 8,
                width: 20, height: 20,
                borderRadius: 2,
                backgroundColor: 'rgba(255,150,60,0.025)',
              }}
            />
          ))
        )}
        {[0,1,2,3,4,5].map(r =>
          [0,1].map(c => (
            <View
              key={`wr${r}${c}`}
              style={{
                position: 'absolute',
                right: c * 22 + 2,
                top: r * 44 + (c % 2) * 22 + 8,
                width: 20, height: 20,
                borderRadius: 2,
                backgroundColor: 'rgba(255,150,60,0.025)',
              }}
            />
          ))
        )}

        {/* Level 5+ red-lit stone walls — fire glow paints the walls crimson */}
        {upgradeLevel >= 5 && (
          <>
            <View style={[
              styles.wallLeft,
              { height: h, backgroundColor: `rgba(160,10,0,${Math.min((upgradeLevel - 4) * 0.055, 0.165)})` },
            ]} />
            <View style={[
              styles.wallRight,
              { height: h, backgroundColor: `rgba(160,10,0,${Math.min((upgradeLevel - 4) * 0.055, 0.165)})` },
            ]} />
          </>
        )}

        {/* ── 4. Smoke wisps (behind forge body) ───────────────────────────── */}
        {smokeWisps.map(s => <SmokeWisp key={s.id} {...s} />)}

        {/* ── 5. Forge body (stone arch) ────────────────────────────────────  */}
        {/* Arch shadow */}
        <View
          style={{
            position: 'absolute',
            left: archX - 8, top: archY + 8,
            width: archW + 16, height: archH,
            borderRadius: (archW + 16) / 2,
            backgroundColor: 'rgba(0,0,0,0.6)',
          }}
        />
        {/* Main arch body */}
        <View
          style={{
            position: 'absolute',
            left: archX, top: archY,
            width: archW, height: archH,
            borderTopLeftRadius:  archW / 2,
            borderTopRightRadius: archW / 2,
            borderBottomLeftRadius:  8,
            borderBottomRightRadius: 8,
            backgroundColor: '#1A1410',
            borderWidth: 2,
            borderColor: '#251C14',
          }}
        />
        {/* Arch stone highlight (top edge) */}
        <View
          style={{
            position: 'absolute',
            left: archX + 4, top: archY + 4,
            width: archW - 8, height: 12,
            borderTopLeftRadius:  (archW - 8) / 2,
            borderTopRightRadius: (archW - 8) / 2,
            backgroundColor: 'rgba(255,200,100,0.06)',
          }}
        />
        {/* Inner arch recess */}
        <View
          style={{
            position: 'absolute',
            left: archX + 12, top: archY + 12,
            width: archW - 24, height: archH - 12,
            borderTopLeftRadius:  (archW - 24) / 2,
            borderTopRightRadius: (archW - 24) / 2,
            borderBottomLeftRadius:  4,
            borderBottomRightRadius: 4,
            backgroundColor: '#120D09',
          }}
        />

        {/* ── 6. Forge opening (glowing mouth) ─────────────────────────────── */}
        {/* Outer opening glow — brightens with upgrade level */}
        <View
          style={{
            position: 'absolute',
            left: openX - 8 - upgradeLevel * 2,
            top:  openY - 8 - upgradeLevel * 2,
            width: openW + 16 + upgradeLevel * 4,
            height: openH + 8 + upgradeLevel * 4,
            borderTopLeftRadius:  (openW + 16) / 2,
            borderTopRightRadius: (openW + 16) / 2,
            backgroundColor: `rgba(255,80,0,${Math.min(0.30 + upgradeLevel * 0.06, 0.60)})`,
          }}
        />
        {/* Opening */}
        <View
          style={{
            position: 'absolute',
            left: openX, top: openY,
            width: openW, height: openH,
            borderTopLeftRadius:  openW / 2,
            borderTopRightRadius: openW / 2,
            backgroundColor: upgradeLevel >= 3 ? '#FF6600' : '#FF5500',
            shadowColor: upgradeLevel >= 3 ? '#FF8800' : '#FF6600',
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 1,
            shadowRadius: 20 + upgradeLevel * 4,
            elevation: 10 + upgradeLevel * 2,
          }}
        />
        {/* Opening inner (brighter center) — whiter core at higher levels */}
        <LinearGradient
          colors={
            upgradeLevel >= 5
              ? ['#FFFFFF', '#FFFAE0', '#FFE060', '#FF9900', '#FF4400']
              : upgradeLevel >= 3
              ? ['#FFFAE0', '#FFE060', '#FFAA00', '#FF6600', '#FF3300']
              : ['#FFFAE0', '#FFD040', '#FF8800', '#FF4400']
          }
          style={{
            position: 'absolute',
            left: openX + openW * 0.15,
            top:  openY + openH * 0.10,
            width: openW * 0.70,
            height: openH * 0.85,
            borderTopLeftRadius:  openW * 0.35,
            borderTopRightRadius: openW * 0.35,
          }}
        />

        {/* ── 7. Fire glow layers (all native driver — transform + opacity) ── */}

        {/* Level 5+ deep crimson outer bloom that lights the stone walls */}
        {upgradeLevel >= 5 && (
          <FireLayer cx={fireCX} cy={fireCY} w={w * 1.10} h={h * 1.05}
            color="rgba(180,0,0,0.06)"
            opacity={Math.min((upgradeLevel - 4) * 0.22, 0.44)}
            flicker={flkA} phaseScale={phaseScaleA} />
        )}
        {/* Level 3+ extra wide ember halo */}
        {upgradeLevel >= 3 && (
          <FireLayer cx={fireCX} cy={fireCY} w={w * 0.92} h={h * 0.95}
            color="rgba(210,15,0,0.07)"
            opacity={Math.min((upgradeLevel - 2) * 0.14, 0.42)}
            flicker={flkB} phaseScale={phaseScaleB} />
        )}

        {/* Layer 1: wide base glow */}
        <FireLayer cx={fireCX} cy={fireCY} w={w * 0.75} h={h * 0.80}
          color="rgba(255,40,0,0.09)"  opacity={1} flicker={flkA} phaseScale={phaseScaleA} />
        {/* Layer 2: outer flame */}
        <FireLayer cx={fireCX} cy={fireCY} w={w * 0.52} h={h * 0.70}
          color="rgba(255,70,0,0.17)"  opacity={1} flicker={flkB} phaseScale={phaseScaleB} />
        {/* Layer 3: mid flame */}
        <FireLayer cx={fireCX} cy={fireCY} w={w * 0.36} h={h * 0.62}
          color="rgba(255,110,0,0.28)" opacity={1} flicker={flkC} phaseScale={phaseScaleC} />
        {/* Layer 4: inner flame */}
        <FireLayer cx={fireCX} cy={fireCY} w={w * 0.25} h={h * 0.54}
          color="rgba(255,160,10,0.42)" opacity={1} flicker={flkD} phaseScale={phaseScaleD} />
        {/* Layer 5: bright column */}
        <FireLayer cx={fireCX} cy={fireCY} w={w * 0.16} h={h * 0.46}
          color="rgba(255,210,40,0.58)" opacity={1} flicker={flkE} phaseScale={phaseScaleE} />
        {/* Layer 6: hot core */}
        <FireLayer cx={fireCX} cy={fireCY} w={w * 0.10} h={h * 0.35}
          color="rgba(255,240,130,0.72)" opacity={1} flicker={flkF} phaseScale={phaseScaleF} />
        {/* Layer 7: white-hot tip — deeper orange-white core at level 3+ */}
        <FireLayer cx={fireCX} cy={fireCY} w={w * 0.055} h={h * 0.18}
          color={upgradeLevel >= 3 ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,230,0.90)'}
          opacity={1} flicker={flkG} phaseScale={phaseScaleG} />
        {/* Level 3+ extra bright inner column */}
        {upgradeLevel >= 3 && (
          <FireLayer cx={fireCX} cy={fireCY} w={w * 0.07} h={h * 0.28}
            color="rgba(255,220,80,0.55)"
            opacity={Math.min((upgradeLevel - 2) * 0.18, 0.55)}
            flicker={flkE} phaseScale={phaseScaleE} />
        )}
        {/* Level 5+ extra white-hot core spike */}
        {upgradeLevel >= 5 && (
          <FireLayer cx={fireCX} cy={fireCY} w={w * 0.04} h={h * 0.22}
            color="rgba(255,255,255,0.90)"
            opacity={Math.min((upgradeLevel - 4) * 0.35, 0.70)}
            flicker={flkG} phaseScale={phaseScaleG} />
        )}

        {/* ── 8. Ambient spark particles ────────────────────────────────────── */}
        {ambientSparks.map(s => <Spark key={s.id} {...s} />)}

        {/* ── 9. Chimney ───────────────────────────────────────────────────── */}
        <View
          style={{
            position: 'absolute',
            left: w * 0.43, top: h * 0.02,
            width: w * 0.14, height: h * 0.14,
            backgroundColor: '#181210',
            borderRadius: 4,
            borderWidth: 1, borderColor: '#221A12',
          }}
        />

        {/* ── 10. Anvil ────────────────────────────────────────────────────── */}
        {/* Anvil stump */}
        <View
          style={{
            position: 'absolute',
            left: anvilCX - w * 0.06,
            top:  anvilCY + h * 0.04,
            width: w * 0.12, height: h * 0.10,
            borderRadius: 4,
            backgroundColor: '#2A1E0E',
          }}
        />
        {/* Anvil body */}
        <View
          style={{
            position: 'absolute',
            left:  anvilCX - w * 0.10,
            top:   anvilCY,
            width: w * 0.20, height: h * 0.08,
            borderRadius: 4,
            backgroundColor: '#1E1E1E',
            borderTopWidth: 3,
            borderTopColor: '#484840',
          }}
        />
        {/* Anvil horn */}
        <View
          style={{
            position: 'absolute',
            left:  anvilCX + w * 0.09,
            top:   anvilCY + h * 0.015,
            width: w * 0.06, height: h * 0.035,
            borderRadius: 12,
            backgroundColor: '#303030',
          }}
        />
        {/* Anvil face — base + flash overlay (native driver) */}
        <View
          style={{
            position: 'absolute',
            left:  anvilCX - w * 0.10,
            top:   anvilCY,
            width: w * 0.20, height: h * 0.025,
            borderRadius: 3,
            backgroundColor: '#686860',
          }}
        />
        <Animated.View
          style={{
            position: 'absolute',
            left:  anvilCX - w * 0.10,
            top:   anvilCY,
            width: w * 0.20, height: h * 0.025,
            borderRadius: 3,
            backgroundColor: '#FFEE88',
            opacity: anvilFlash,
          }}
        />
        {/* Metal piece on anvil when heating/hammering (JS driver) */}
        {(craftPhase === 'HEATING' || craftPhase === 'HAMMERING') && (
          <Animated.View
            style={{
              position: 'absolute',
              left:  anvilCX - w * 0.07,
              top:   anvilCY - h * 0.022,
              width: w * 0.14, height: h * 0.028,
              borderRadius: 3,
              backgroundColor: metalGlow.interpolate({
                inputRange: [0, 0.4, 1],
                outputRange: ['#444440', '#FF6600', '#FFCC00'],
              }),
              shadowColor: '#FF8800',
              shadowOpacity: 0.9,
              shadowRadius: 12,
              elevation: 4,
            }}
          />
        )}

        {/* ── 11. Strike sparks ────────────────────────────────────────────── */}
        {strikeSparks.map(s => (
          <StrikeSpark
            key={s.id}
            {...s}
            triggerAnim={triggerAnim}
          />
        ))}

        {/* ── 12. Coal embers at base of forge ─────────────────────────────── */}
        {Array.from({ length: 10 }, (_, i) => (
          <View
            key={`coal${i}`}
            style={{
              position: 'absolute',
              left: openX + openW * 0.1 + i * (openW * 0.08),
              top:  fireCY + 2,
              width: 6 + (i % 3) * 3,
              height: 4 + (i % 2) * 2,
              borderRadius: 3,
              backgroundColor: i % 3 === 0 ? '#CC2200' : i % 3 === 1 ? '#AA1800' : '#220800',
            }}
          />
        ))}

        {/* ── 13. Floor / ground ───────────────────────────────────────────── */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.70)']}
          style={{
            position: 'absolute',
            left: 0, right: 0,
            top: h * 0.72, bottom: 0,
          }}
          pointerEvents="none"
        />
        {/* Floor fire reflection */}
        <Animated.View
          style={{
            position: 'absolute',
            left: w * 0.15, right: w * 0.15,
            top: h * 0.85, height: h * 0.12,
            borderRadius: w * 0.3,
            backgroundColor: 'rgba(255,80,0,0.10)',
            opacity: ambientOpacity,
          }}
          pointerEvents="none"
        />

        {/* ── 14. Cool blue overlay for COOLING phase ───────────────────────── */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: coolBlue.interpolate({
                inputRange: [0, 1],
                outputRange: ['rgba(0,0,0,0)', 'rgba(20,60,160,0.16)'],
              }),
              pointerEvents: 'none',
            } as any,
          ]}
          pointerEvents="none"
        />

        {/* ── 15. Top vignette ─────────────────────────────────────────────── */}
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'transparent']}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: h * 0.22 }}
          pointerEvents="none"
        />
        {/* Side vignettes */}
        <LinearGradient
          colors={['rgba(0,0,0,0.45)', 'transparent']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: w * 0.18 }}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.45)']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: w * 0.18 }}
          pointerEvents="none"
        />

      </View>
    );
  },
);

ForgeScene3D.displayName = 'ForgeScene3D';
export default ForgeScene3D;

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#080402',
  },
  sceneGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,80,0,0.07)',
  },
  wallLeft: {
    position: 'absolute',
    left: 0, top: 0, bottom: 0,
    width: 48,
    backgroundColor: '#0D0A07',
  },
  wallRight: {
    position: 'absolute',
    right: 0, top: 0, bottom: 0,
    width: 48,
    backgroundColor: '#0D0A07',
  },
});
