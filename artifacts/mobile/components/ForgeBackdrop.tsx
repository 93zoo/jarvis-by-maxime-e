/**
 * ForgeBackdrop — cinematic living background for the forge screen.
 *
 * Layers (back → front):
 *  1. The forge artwork (assets/images/forge-bg.png)
 *  2. Warm fire glow pulsing over the hearth (right-middle area)
 *  3. Rising embers / sparks (loop, native driver)
 *  4. Slow smoke wisps drifting upward
 *  5. Ambient brightness "breath" (subtle scene light variation)
 *  6. Floating dust particles
 *  7. Bottom + top vignettes so UI panels stay readable
 *
 * All animation loops use transform/opacity only → 60 FPS friendly,
 * and the ember count is small enough for older phones.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, DimensionValue, Easing, ImageBackground, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const FORGE_BG = require('../assets/images/forge-bg.png');

// ─── Ember particle ─────────────────────────────────────────────────────────
function Ember({ x, size, duration, delay, drift, color }: {
  x: DimensionValue; size: number; duration: number; delay: number; drift: number; color: string;
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay, duration]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -260] });
  const translateX = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, drift, drift * 0.4] });
  const opacity = anim.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 0.8, 0] });
  const scale = anim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.4, 1, 0.3] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x,
        bottom: '26%',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        opacity,
        transform: [{ translateY }, { translateX }, { scale }],
      }}
    />
  );
}

// ─── Smoke wisp ─────────────────────────────────────────────────────────────
function SmokeWisp({ x, size, duration, delay }: { x: DimensionValue; size: number; duration: number; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay, duration]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -340] });
  const translateX = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 24, -10] });
  const opacity = anim.interpolate({ inputRange: [0, 0.25, 0.75, 1], outputRange: [0, 0.10, 0.06, 0] });
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2.4] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x,
        bottom: '34%',
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#8A8078',
        opacity,
        transform: [{ translateY }, { translateX }, { scale }],
      }}
    />
  );
}

// ─── Dust mote ──────────────────────────────────────────────────────────────
function Dust({ x, y, size, duration, delay }: { x: DimensionValue; y: DimensionValue; size: number; duration: number; delay: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay, duration]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -14] });
  const translateX = anim.interpolate({ inputRange: [0, 1], outputRange: [0, 10] });
  const opacity = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.03, 0.14, 0.03] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#FFD9A0',
        opacity,
        transform: [{ translateY }, { translateX }],
      }}
    />
  );
}

// ─── Main backdrop ───────────────────────────────────────────────────────────
export default function ForgeBackdrop() {
  const fireGlow = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Fire glow: fast irregular flicker, like real flames
    const flicker = Animated.loop(
      Animated.sequence([
        Animated.timing(fireGlow, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(fireGlow, { toValue: 0.35, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(fireGlow, { toValue: 0.8, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(fireGlow, { toValue: 0.2, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    // Scene breath: very slow ambient light variation
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 6500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 6500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    flicker.start();
    breathe.start();
    return () => { flicker.stop(); breathe.stop(); };
  }, [fireGlow, breath]);

  const glowOpacity = fireGlow.interpolate({ inputRange: [0, 1], outputRange: [0.10, 0.28] });
  const breathOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.02, 0.06] });

  // Deterministic particle configs (stable across renders)
  const embers = useMemo(() => [
    { x: '44%', size: 6, duration: 2600, delay: 0, drift: 18, color: '#FF9A3C' },
    { x: '50%', size: 5, duration: 2200, delay: 500, drift: -14, color: '#FFC06A' },
    { x: '47%', size: 7, duration: 3100, delay: 1100, drift: 26, color: '#FF7B24' },
    { x: '53%', size: 5, duration: 2400, delay: 1600, drift: -22, color: '#FFB054' },
    { x: '41%', size: 5, duration: 2900, delay: 800, drift: 12, color: '#FF9A3C' },
    { x: '56%', size: 6, duration: 2700, delay: 2000, drift: -8, color: '#FFD08A' },
    { x: '46%', size: 4, duration: 2000, delay: 2400, drift: 20, color: '#FFC06A' },
    { x: '51%', size: 5, duration: 3300, delay: 300, drift: -18, color: '#FF7B24' },
    { x: '43%', size: 4, duration: 2500, delay: 1400, drift: -26, color: '#FFE0A0' },
    { x: '54%', size: 6, duration: 3000, delay: 1900, drift: 16, color: '#FF9A3C' },
  ] as const, []);

  const wisps = useMemo(() => [
    { x: '40%', size: 60, duration: 7000, delay: 0 },
    { x: '52%', size: 50, duration: 8200, delay: 2600 },
    { x: '46%', size: 70, duration: 7600, delay: 4800 },
    { x: '56%', size: 44, duration: 6800, delay: 1200 },
  ] as const, []);

  const dust = useMemo(() => [
    { x: '18%', y: '22%', size: 3, duration: 4200, delay: 0 },
    { x: '72%', y: '30%', size: 2, duration: 5000, delay: 1400 },
    { x: '30%', y: '44%', size: 2, duration: 4600, delay: 2800 },
    { x: '84%', y: '18%', size: 3, duration: 5400, delay: 700 },
    { x: '60%', y: '52%', size: 2, duration: 4000, delay: 2100 },
  ] as const, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <ImageBackground source={FORGE_BG} style={StyleSheet.absoluteFill} resizeMode="cover" />

      {/* Fire glow over the hearth */}
      <Animated.View style={[styles.hearthGlow, { opacity: glowOpacity }]} />
      {/* Heat shimmer: soft warm band above the fire */}
      <Animated.View style={[styles.heatBand, { opacity: glowOpacity }]} />
      {/* Ambient brightness breath */}
      <Animated.View style={[styles.breath, { opacity: breathOpacity }]} />

      {wisps.map((s, i) => <SmokeWisp key={i} {...s} />)}
      {embers.map((e, i) => <Ember key={i} {...e} />)}
      {dust.map((d, i) => <Dust key={i} {...d} />)}

      {/* Vignettes for UI readability */}
      <LinearGradient colors={['rgba(4,2,1,0.55)', 'transparent']} style={styles.topVignette} />
      <LinearGradient colors={['transparent', 'rgba(4,2,1,0.72)']} style={styles.bottomVignette} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Soft elliptical halo positioned over the artwork's hearth (center, mid-height)
  hearthGlow: {
    position: 'absolute',
    left: '34%',
    right: '34%',
    top: '26%',
    height: '22%',
    borderRadius: 200,
    backgroundColor: '#FF8A2A',
  },
  heatBand: {
    position: 'absolute',
    left: '40%',
    right: '40%',
    top: '20%',
    height: '10%',
    borderRadius: 80,
    backgroundColor: 'rgba(255,180,90,0.22)',
  },
  breath: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FF9A3C',
  },
  topVignette: { position: 'absolute', top: 0, left: 0, right: 0, height: 110 },
  bottomVignette: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 240 },
});
