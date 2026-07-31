/**
 * ForgeScene — Bird's-eye 2D animated smithy view.
 * Pure React Native Animated — no Three.js / WebGL dependency.
 * Works on all Android / iOS devices via Expo Go or native build.
 */
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import AudioManager from '@/utils/AudioManager';

// ─── Public types (kept identical for parent compatibility) ───────────────────
export type CraftPhase = 'IDLE' | 'HEATING' | 'HAMMERING' | 'COOLING' | 'RESULT';
export interface ForgeScene3DRef { triggerHammerStrike: () => void; }
interface Props { craftPhase: CraftPhase; upgradeLevel?: number; }

// ─── Spark particle ───────────────────────────────────────────────────────────
interface SparkConfig { id: number; ox: number; oy: number; delay: number; color: string }

function Spark({ ox, oy, delay, color }: SparkConfig) {
  const tx   = useRef(new Animated.Value(0)).current;
  const ty   = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  const { dx, dy, dur } = useMemo(() => ({
    dx:  (Math.random() - 0.5) * 70,
    dy:  -(35 + Math.random() * 90),
    dur: 700 + Math.random() * 700,
  }), []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(ty, { toValue: dy,  duration: dur, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(tx, { toValue: dx,  duration: dur, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(fade, { toValue: 1,   duration: 80,  useNativeDriver: true }),
            Animated.timing(fade, { toValue: 0,   duration: dur - 80, useNativeDriver: true }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(ty, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(tx, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.spark,
        { left: ox, top: oy, backgroundColor: color, opacity: fade,
          transform: [{ translateX: tx }, { translateY: ty }] },
      ]}
    />
  );
}

// ─── Strike sparks (burst on hammer hit) ─────────────────────────────────────
interface StrikeSparkProps { id: number; triggerAnim: Animated.Value; ox: number; oy: number }

function StrikeSpark({ triggerAnim, ox, oy }: StrikeSparkProps) {
  const tx   = useRef(new Animated.Value(0)).current;
  const ty   = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const dx = useMemo(() => (Math.random() - 0.5) * 100, []);
  const dy = useMemo(() => -(20 + Math.random() * 70),  []);

  useEffect(() => {
    const id = triggerAnim.addListener(({ value }) => {
      if (value < 0.05) {
        tx.setValue(0); ty.setValue(0); fade.setValue(0);
        Animated.parallel([
          Animated.timing(ty,   { toValue: dy, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(tx,   { toValue: dx, duration: 500, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(fade, { toValue: 1,  duration: 60,  useNativeDriver: true }),
            Animated.timing(fade, { toValue: 0,  duration: 440, useNativeDriver: true }),
          ]),
        ]).start();
      }
    });
    return () => triggerAnim.removeListener(id);
  }, []);

  return (
    <Animated.View
      style={[
        styles.strikeSpark,
        { left: ox, top: oy, opacity: fade,
          transform: [{ translateX: tx }, { translateY: ty }] },
      ]}
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
const ForgeScene3D = forwardRef<ForgeScene3DRef, Props>(
  ({ craftPhase, upgradeLevel = 0 }, ref) => {
    // ── Continuous fire flicker ─────────────────────────────────────────────
    const flicker = useRef(new Animated.Value(1)).current;

    useEffect(() => {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(flicker, { toValue: 1.18, duration: 110, useNativeDriver: true }),
          Animated.timing(flicker, { toValue: 0.88, duration: 80,  useNativeDriver: true }),
          Animated.timing(flicker, { toValue: 1.12, duration: 130, useNativeDriver: true }),
          Animated.timing(flicker, { toValue: 0.93, duration: 90,  useNativeDriver: true }),
          Animated.timing(flicker, { toValue: 1.08, duration: 120, useNativeDriver: true }),
          Animated.timing(flicker, { toValue: 0.97, duration: 160, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }, []);

    // ── Phase-based fire glow size ──────────────────────────────────────────
    const fireSize = useRef(new Animated.Value(1)).current;
    const glowOpacity = useRef(new Animated.Value(0.6)).current;
    const metalGlow = useRef(new Animated.Value(0)).current;
    const coolBlue  = useRef(new Animated.Value(0)).current;

    useEffect(() => {
      const boost = upgradeLevel * 0.04;
      const target =
        craftPhase === 'IDLE'      ? 1.0 + boost :
        craftPhase === 'HEATING'   ? 1.45 + boost :
        craftPhase === 'HAMMERING' ? 1.15 + boost :
        craftPhase === 'COOLING'   ? 0.7  + boost : 1.0 + boost;
      const glow =
        craftPhase === 'HEATING'   ? 0.95 :
        craftPhase === 'HAMMERING' ? 0.85 :
        craftPhase === 'COOLING'   ? 0.40 : 0.65;
      const metal =
        craftPhase === 'HEATING'   ? 0.9 :
        craftPhase === 'HAMMERING' ? 1.0 : 0;
      const cool = craftPhase === 'COOLING' ? 1 : 0;

      Animated.parallel([
        Animated.timing(fireSize,    { toValue: target, duration: 600, useNativeDriver: true }),
        Animated.timing(glowOpacity, { toValue: glow,   duration: 600, useNativeDriver: false }),
        Animated.timing(metalGlow,   { toValue: metal,  duration: 400, useNativeDriver: false }),
        Animated.timing(coolBlue,    { toValue: cool,   duration: 800, useNativeDriver: false }),
      ]).start();
    }, [craftPhase, upgradeLevel]);

    // ── Hammer strike trigger ───────────────────────────────────────────────
    const triggerAnim = useRef(new Animated.Value(1)).current;
    const anvilFlash  = useRef(new Animated.Value(0)).current;

    useImperativeHandle(ref, () => ({
      triggerHammerStrike: () => {
        triggerAnim.setValue(0);
        Animated.timing(triggerAnim, { toValue: 1, duration: 20, useNativeDriver: true }).start();
        Animated.sequence([
          Animated.timing(anvilFlash, { toValue: 1, duration: 40,  useNativeDriver: false }),
          Animated.timing(anvilFlash, { toValue: 0, duration: 280, useNativeDriver: false }),
        ]).start();
      },
    }));

    // ── Forge ambience (web only) ───────────────────────────────────────────
    useEffect(() => {
      AudioManager.startForgeAmbience();
      return () => AudioManager.stopForgeAmbience();
    }, []);

    // ── Spark configs (stable across renders) ───────────────────────────────
    const ambientSparks = useMemo<SparkConfig[]>(() =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        ox: 140 + (Math.random() - 0.5) * 50,
        oy: 100 + (Math.random() - 0.5) * 30,
        delay: i * 180,
        color: i % 3 === 0 ? '#FFCC44' : i % 3 === 1 ? '#FF6600' : '#FF3300',
      })), [],
    );

    const strikeSparks = useMemo(() =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        ox: 200 + (Math.random() - 0.5) * 30,
        oy: 260 + (Math.random() - 0.5) * 20,
      })), [],
    );

    const fireScale = Animated.multiply(flicker, fireSize);

    return (
      <View style={styles.container}>
        {/* ── Stone floor background ─────────────────────────────────────── */}
        <LinearGradient
          colors={['#0A0806', '#12100C', '#0E0B08']}
          style={StyleSheet.absoluteFill}
        />

        {/* ── Floor texture grid lines ──────────────────────────────────── */}
        <View style={styles.grid} pointerEvents="none">
          {[0,1,2,3,4,5].map(i => (
            <View key={`h${i}`} style={[styles.gridH, { top: i * 80 + 40 }]} />
          ))}
          {[0,1,2,3,4].map(i => (
            <View key={`v${i}`} style={[styles.gridV, { left: i * 80 + 20 }]} />
          ))}
        </View>

        {/* ── Ambient ground glow from forge fire ───────────────────────── */}
        <Animated.View
          style={[styles.groundGlow, { opacity: glowOpacity }]}
          pointerEvents="none"
        />

        {/* ── Barrels (top-right) ───────────────────────────────────────── */}
        <View style={[styles.barrel, { left: 280, top: 60 }]} />
        <View style={[styles.barrel, { left: 305, top: 85, width: 28, height: 28, borderRadius: 14 }]} />
        <View style={[styles.barrel, { left: 265, top: 88, width: 24, height: 24, borderRadius: 12 }]} />

        {/* ── Tool rack (left wall) ─────────────────────────────────────── */}
        <View style={styles.toolRack} />
        <View style={[styles.tool, { left: 14, top: 110 }]} />
        <View style={[styles.tool, { left: 22, top: 140, height: 60 }]} />
        <View style={[styles.tool, { left: 10, top: 180, height: 50 }]} />
        <View style={[styles.tool, { left: 20, top: 230, height: 40 }]} />

        {/* ── Water trough (bottom-right) ───────────────────────────────── */}
        <Animated.View
          style={[styles.trough, {
            shadowColor: coolBlue.interpolate({ inputRange: [0,1], outputRange: ['transparent', '#4488FF'] }),
            shadowOpacity: 0.8, shadowRadius: 10,
          }]}
        >
          <Animated.View style={[styles.troughWater, {
            backgroundColor: coolBlue.interpolate({
              inputRange: [0, 1], outputRange: ['#0D1A26', '#1E4A88'],
            }),
          }]} />
        </Animated.View>

        {/* ── Workbench (right) ─────────────────────────────────────────── */}
        <View style={styles.workbench}>
          <View style={[styles.workItem, { left: 4, top: 8 }]} />
          <View style={[styles.workItem, { left: 28, top: 6, height: 14 }]} />
        </View>

        {/* ── Left back anvil ───────────────────────────────────────────── */}
        <View style={[styles.stump, { left: 58, top: 148 }]} />
        <View style={[styles.anvil, { left: 46, top: 130, width: 44 }]} />
        <View style={[styles.anvilHorn, { left: 86, top: 136 }]} />

        {/* ── Right back anvil ──────────────────────────────────────────── */}
        <View style={[styles.stump, { left: 228, top: 155 }]} />
        <View style={[styles.anvil, { left: 215, top: 136, width: 40 }]} />
        <View style={[styles.anvilHorn, { left: 251, top: 141 }]} />

        {/* ── Main active anvil (center) ─────────────────────────────────── */}
        <View style={[styles.stump, { left: 178, top: 255 }]} />
        <View style={[styles.anvil, { left: 164, top: 236 }]} />
        <Animated.View
          style={[styles.anvilFace, {
            backgroundColor: anvilFlash.interpolate({
              inputRange: [0, 1], outputRange: ['#707070', '#FFEE88'],
            }),
          }]}
        />
        <View style={[styles.anvilHorn, { left: 214, top: 242 }]} />

        {/* ── Metal piece on anvil (visible when heating/hammering) ──────── */}
        {(craftPhase === 'HEATING' || craftPhase === 'HAMMERING') && (
          <Animated.View
            style={[styles.metalPiece, {
              backgroundColor: metalGlow.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: ['#5A5A5A', '#FF6600', '#FFCC00'],
              }),
              shadowColor: '#FF6600',
              shadowOpacity: metalGlow as unknown as number,
              shadowRadius: 12,
            }]}
          />
        )}

        {/* ── Forge furnace (top-center) ────────────────────────────────── */}
        <View style={styles.furnaceBase} />
        <View style={styles.furnaceBody} />
        <View style={styles.furnaceOpening} />
        {/* Chimney */}
        <View style={styles.chimney} />

        {/* ── Fire glow layers ─────────────────────────────────────────────  */}
        <Animated.View
          style={[styles.fireGlow3, { transform: [{ scale: fireScale }], opacity: glowOpacity }]}
          pointerEvents="none"
        />
        <Animated.View
          style={[styles.fireGlow2, { transform: [{ scale: fireScale }], opacity: glowOpacity }]}
          pointerEvents="none"
        />
        <Animated.View
          style={[styles.fireGlow1, { transform: [{ scale: fireScale }] }]}
          pointerEvents="none"
        />
        <Animated.View
          style={[styles.fireCore, { transform: [{ scale: Animated.multiply(flicker, new Animated.Value(0.85)) }] }]}
          pointerEvents="none"
        />

        {/* ── Ambient sparks from furnace ───────────────────────────────── */}
        {ambientSparks.map(s => <Spark key={s.id} {...s} />)}

        {/* ── Strike sparks from active anvil ──────────────────────────── */}
        {strikeSparks.map(s => (
          <StrikeSpark key={s.id} id={s.id} triggerAnim={triggerAnim} ox={s.ox} oy={s.oy} />
        ))}

        {/* ── Coal pile near furnace ────────────────────────────────────── */}
        {[0,1,2,3,4,5].map(i => (
          <View key={`c${i}`} style={[styles.coal, {
            left: 100 + i * 9 + (i % 2) * 4,
            top: 168 + (i % 3) * 6,
            width: 8 + (i % 3) * 2,
            height: 5 + (i % 2) * 2,
          }]} />
        ))}

        {/* ── Cool blue overlay when COOLING ───────────────────────────── */}
        <Animated.View
          style={[styles.coolOverlay, { opacity: coolBlue.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] }) }]}
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
  container:    { flex: 1, overflow: 'hidden' },

  grid:         { ...StyleSheet.absoluteFillObject },
  gridH:        { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,160,60,0.04)' },
  gridV:        { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,160,60,0.04)' },

  groundGlow: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 300,
    backgroundColor: 'rgba(255,60,0,0.06)',
    borderRadius: 200,
  },

  // Furnace
  furnaceBase: {
    position: 'absolute', left: 100, top: 155,
    width: 90, height: 30, borderRadius: 4,
    backgroundColor: '#28201A',
  },
  furnaceBody: {
    position: 'absolute', left: 103, top: 80,
    width: 84, height: 80, borderRadius: 6,
    backgroundColor: '#1E1812',
    borderWidth: 1, borderColor: '#3A2A1A',
  },
  furnaceOpening: {
    position: 'absolute', left: 122, top: 132,
    width: 46, height: 30,
    backgroundColor: '#FF4400',
    borderRadius: 4,
    shadowColor: '#FF6600', shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1, shadowRadius: 16,
    elevation: 6,
  },
  chimney: {
    position: 'absolute', left: 132, top: 38,
    width: 26, height: 44,
    backgroundColor: '#141010',
    borderRadius: 4,
    borderWidth: 1, borderColor: '#2A2020',
  },

  // Fire glow (centered on furnace opening)
  fireGlow3: {
    position: 'absolute', left: 80, top: 70,
    width: 130, height: 130, borderRadius: 65,
    backgroundColor: 'rgba(255,55,0,0.12)',
  },
  fireGlow2: {
    position: 'absolute', left: 100, top: 90,
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: 'rgba(255,100,0,0.22)',
  },
  fireGlow1: {
    position: 'absolute', left: 116, top: 106,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: 'rgba(255,160,0,0.45)',
  },
  fireCore: {
    position: 'absolute', left: 131, top: 120,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(255,240,180,0.90)',
  },

  // Anvils
  stump: {
    position: 'absolute',
    width: 34, height: 28, borderRadius: 4,
    backgroundColor: '#3C2808',
  },
  anvil: {
    position: 'absolute',
    width: 50, height: 20, borderRadius: 3,
    backgroundColor: '#2A2A2A',
    borderTopWidth: 2, borderTopColor: '#505050',
  },
  anvilFace: {
    position: 'absolute', left: 164, top: 236,
    width: 50, height: 6, borderRadius: 2,
    backgroundColor: '#707070',
  },
  anvilHorn: {
    position: 'absolute',
    width: 18, height: 10, borderRadius: 5,
    backgroundColor: '#404040',
  },

  // Metal piece on anvil
  metalPiece: {
    position: 'absolute', left: 178, top: 238,
    width: 32, height: 10, borderRadius: 3,
    backgroundColor: '#5A5A5A',
  },

  // Tool rack
  toolRack: {
    position: 'absolute', left: 8, top: 80,
    width: 8, height: 200,
    backgroundColor: '#2A1A08',
    borderRadius: 4,
  },
  tool: {
    position: 'absolute',
    width: 4, height: 45, borderRadius: 2,
    backgroundColor: '#383838',
  },

  // Barrels
  barrel: {
    position: 'absolute',
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#2A1508',
    borderWidth: 2, borderColor: '#1A1010',
  },

  // Water trough
  trough: {
    position: 'absolute', right: 18, bottom: 80,
    width: 80, height: 30, borderRadius: 6,
    backgroundColor: '#1A1208',
    overflow: 'hidden',
  },
  troughWater: {
    position: 'absolute', left: 4, right: 4, top: 6, bottom: 4,
    borderRadius: 4,
    backgroundColor: '#0D1A26',
  },

  // Workbench
  workbench: {
    position: 'absolute', right: 14, top: 160,
    width: 60, height: 44, borderRadius: 4,
    backgroundColor: '#2C1A08',
    borderWidth: 1, borderColor: '#3A2210',
  },
  workItem: {
    position: 'absolute',
    width: 20, height: 10, borderRadius: 2,
    backgroundColor: '#404040',
  },

  // Coal pile
  coal: {
    position: 'absolute',
    borderRadius: 3,
    backgroundColor: '#181010',
    borderWidth: 1, borderColor: '#221818',
  },

  // Particles
  spark: {
    position: 'absolute',
    width: 4, height: 4, borderRadius: 2,
  },
  strikeSpark: {
    position: 'absolute',
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: '#FFDD44',
  },

  // Cool overlay
  coolOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#2244AA',
  },
});
