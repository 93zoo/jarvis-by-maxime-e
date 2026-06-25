import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Line, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

const SILVER = '#7A99B4';

interface JarvisOrbProps {
  isActive: boolean;
  size?: number;
}

export function JarvisOrb({ isActive, size = 120 }: JarvisOrbProps) {
  const colors = useColors();

  const ring0     = useSharedValue(0);
  const ring1     = useSharedValue(0);
  const ring2     = useSharedValue(0);
  const ring3     = useSharedValue(0);

  const rotFwd    = useSharedValue(0);   // inner ring: forward fast
  const rotRev    = useSharedValue(0);   // outer ring: reverse slow
  const rotMid    = useSharedValue(0);   // mid ring: forward medium
  const rotScan   = useSharedValue(0);   // radar sweep
  const rotPart1  = useSharedValue(0);   // particle 1 orbit
  const rotPart2  = useSharedValue(0);   // particle 2 orbit

  const coreGlow  = useSharedValue(0.7);
  const coreScale = useSharedValue(1);

  useEffect(() => {
    [ring0,ring1,ring2,ring3,rotFwd,rotRev,rotMid,rotScan,rotPart1,rotPart2,coreGlow,coreScale]
      .forEach(v => cancelAnimation(v));

    const dur = isActive ? 800 : 2000;

    // Pulse rings — 4 staggered rings for richer effect
    ring0.value = withRepeat(withTiming(1, { duration: dur, easing: Easing.out(Easing.ease) }), -1, false);
    ring1.value = withDelay(dur / 4,   withRepeat(withTiming(1, { duration: dur, easing: Easing.out(Easing.ease) }), -1, false));
    ring2.value = withDelay(dur / 2,   withRepeat(withTiming(1, { duration: dur, easing: Easing.out(Easing.ease) }), -1, false));
    ring3.value = withDelay(dur * 0.75, withRepeat(withTiming(1, { duration: dur, easing: Easing.out(Easing.ease) }), -1, false));

    // Rotating rings
    rotRev.value  = withRepeat(withTiming(-360, { duration: isActive ? 6000  : 16000, easing: Easing.linear }), -1, false);
    rotFwd.value  = withRepeat(withTiming( 360, { duration: isActive ? 2500  : 7500,  easing: Easing.linear }), -1, false);
    rotMid.value  = withRepeat(withTiming( 360, { duration: isActive ? 4000  : 11000, easing: Easing.linear }), -1, false);
    rotScan.value = withRepeat(withTiming( 360, { duration: isActive ? 3000  : 8000,  easing: Easing.linear }), -1, false);

    // Orbiting particles
    rotPart1.value = withRepeat(withTiming( 360, { duration: isActive ? 2200 : 5500, easing: Easing.linear }), -1, false);
    rotPart2.value = withRepeat(withTiming(-360, { duration: isActive ? 3500 : 9000, easing: Easing.linear }), -1, false);

    // Core breathing
    coreGlow.value = withRepeat(
      withSequence(
        withTiming(1,                    { duration: dur * 0.5, easing: Easing.inOut(Easing.ease) }),
        withTiming(isActive ? 0.7 : 0.45, { duration: dur * 0.5, easing: Easing.inOut(Easing.ease) }),
      ), -1, false
    );
    coreScale.value = withRepeat(
      withSequence(
        withTiming(isActive ? 1.14 : 1.08, { duration: dur * 0.5, easing: Easing.inOut(Easing.ease) }),
        withTiming(1,                       { duration: dur * 0.5, easing: Easing.inOut(Easing.ease) }),
      ), -1, false
    );

    return () => {
      [ring0,ring1,ring2,ring3,rotFwd,rotRev,rotMid,rotScan,rotPart1,rotPart2,coreGlow,coreScale]
        .forEach(v => cancelAnimation(v));
    };
  }, [isActive]);

  // Pulse ring styles
  const mkRing = (sv: typeof ring0, maxScale: number, maxOpacity: number) =>
    useAnimatedStyle(() => ({
      opacity: interpolate(sv.value, [0, 0.15, 1], [0, maxOpacity, 0]),
      transform: [{ scale: interpolate(sv.value, [0, 1], [1, maxScale]) }],
    }));

  const ring0Style = mkRing(ring0, 2.2,  0.9);
  const ring1Style = mkRing(ring1, 2.7,  0.55);
  const ring2Style = mkRing(ring2, 3.3,  0.30);
  const ring3Style = mkRing(ring3, 3.9,  0.14);

  const rotRevStyle  = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotRev.value}deg`  }] }));
  const rotFwdStyle  = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotFwd.value}deg`  }] }));
  const rotMidStyle  = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotMid.value}deg`  }] }));
  const rotScanStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotScan.value}deg` }] }));
  const part1Style   = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotPart1.value}deg`}] }));
  const part2Style   = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotPart2.value}deg`}] }));
  const coreStyle    = useAnimatedStyle(() => ({ opacity: coreGlow.value, transform: [{ scale: coreScale.value }] }));

  const outerSize = size * 2.8;
  const half = outerSize / 2;

  const ringBase = {
    position: 'absolute' as const,
    width: size, height: size,
    borderRadius: size / 2,
    borderWidth: 1,
    top: half - size / 2,
    left: half - size / 2,
  };

  const cx = size / 2;
  const cy = size / 2;

  return (
    <View style={{ width: outerSize, height: outerSize, alignItems: 'center', justifyContent: 'center' }}>

      {/* ── 4 expanding pulse rings ── */}
      <Animated.View style={[ringBase, { borderColor: colors.primary + 'DD' }, ring0Style]} />
      <Animated.View style={[ringBase, { borderColor: colors.primary + '80' }, ring1Style]} />
      <Animated.View style={[ringBase, { borderColor: colors.accent + '50' },  ring2Style]} />
      <Animated.View style={[ringBase, { borderColor: colors.accent + '22' },  ring3Style]} />

      {/* ── Orb body ── */}
      <View style={[styles.orb, { width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }]}>

        {/* Base */}
        <View style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2, backgroundColor: '#030609' }]} />
        <View style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2, backgroundColor: colors.primary + '0F' }]} />

        {/* Outer silver ring — reverse slow */}
        <Animated.View style={[StyleSheet.absoluteFillObject, rotRevStyle]}>
          <Svg width={size} height={size}>
            <Circle cx={cx} cy={cy} r={cx - 2} fill="none" stroke={SILVER} strokeWidth={1} strokeDasharray="3 7" opacity={0.55} />
          </Svg>
        </Animated.View>

        {/* Mid blue ring — forward medium */}
        <Animated.View style={[StyleSheet.absoluteFillObject, rotMidStyle]}>
          <Svg width={size} height={size}>
            <Circle cx={cx} cy={cy} r={cx * 0.82} fill="none" stroke={colors.primary} strokeWidth={1.2} strokeDasharray="10 6" opacity={0.45} />
          </Svg>
        </Animated.View>

        {/* Inner cyan ring — forward fast */}
        <Animated.View style={[StyleSheet.absoluteFillObject, rotFwdStyle]}>
          <Svg width={size} height={size}>
            <Circle cx={cx} cy={cy} r={cx * 0.62} fill="none" stroke={colors.accent} strokeWidth={1.5} strokeDasharray="6 4" opacity={0.80} />
          </Svg>
        </Animated.View>

        {/* ── Radar sweep ── */}
        <Animated.View style={[StyleSheet.absoluteFillObject, rotScanStyle]}>
          <Svg width={size} height={size}>
            <Defs>
              <LinearGradient id="sweep" x1={cx} y1={cy} x2={size * 0.95} y2={cy} gradientUnits="userSpaceOnUse">
                <Stop offset="0%"   stopColor={colors.accent} stopOpacity="0" />
                <Stop offset="60%"  stopColor={colors.accent} stopOpacity="0.5" />
                <Stop offset="100%" stopColor={colors.accent} stopOpacity="0.9" />
              </LinearGradient>
            </Defs>
            <Line x1={cx} y1={cy} x2={size * 0.96} y2={cy} stroke="url(#sweep)" strokeWidth={1.5} />
          </Svg>
        </Animated.View>

        {/* ── Orbiting particle 1 (outer, forward) ── */}
        <Animated.View style={[{ position: 'absolute', width: size, height: size }, part1Style]}>
          <View style={{
            position: 'absolute',
            width: 6, height: 6, borderRadius: 3,
            backgroundColor: colors.primary,
            top: size * 0.06 - 3,
            left: cx - 3,
            shadowColor: colors.primary, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
          }} />
        </Animated.View>

        {/* ── Orbiting particle 2 (inner, reverse) ── */}
        <Animated.View style={[{ position: 'absolute', width: size, height: size }, part2Style]}>
          <View style={{
            position: 'absolute',
            width: 4, height: 4, borderRadius: 2,
            backgroundColor: colors.accent,
            top: size * 0.16 - 2,
            left: cx - 2,
            shadowColor: colors.accent, shadowOpacity: 1, shadowRadius: 5, shadowOffset: { width: 0, height: 0 },
          }} />
        </Animated.View>

        {/* ── Orbiting particle 3 (mid-outer, reverse slow) ── */}
        <Animated.View style={[{ position: 'absolute', width: size, height: size }, rotRevStyle]}>
          <View style={{
            position: 'absolute',
            width: 4, height: 4, borderRadius: 2,
            backgroundColor: colors.primary + 'CC',
            top: cx - 2,
            left: size * 0.04 - 2,  // left side of orb
            shadowColor: colors.primary, shadowOpacity: 0.8, shadowRadius: 4, shadowOffset: { width: 0, height: 0 },
          }} />
        </Animated.View>

        {/* Crosshair */}
        <View style={StyleSheet.absoluteFillObject}>
          <Svg width={size} height={size}>
            <Line x1={size * 0.16} y1={cy} x2={size * 0.37} y2={cy} stroke={colors.accent} strokeWidth={0.8} opacity={0.45} />
            <Line x1={size * 0.63} y1={cy} x2={size * 0.84} y2={cy} stroke={colors.accent} strokeWidth={0.8} opacity={0.45} />
            <Line x1={cx} y1={size * 0.16} x2={cx} y2={size * 0.37} stroke={colors.accent} strokeWidth={0.8} opacity={0.45} />
            <Line x1={cx} y1={size * 0.63} x2={cx} y2={size * 0.84} stroke={colors.accent} strokeWidth={0.8} opacity={0.45} />
          </Svg>
        </View>

        {/* Core radial glow */}
        <Animated.View style={[StyleSheet.absoluteFillObject, coreStyle]}>
          <Svg width={size} height={size}>
            <Defs>
              <RadialGradient id="orbGrad" cx="50%" cy="50%" r="50%">
                <Stop offset="0%"   stopColor="#ffffff"       stopOpacity="1"   />
                <Stop offset="12%"  stopColor={colors.accent} stopOpacity="0.9" />
                <Stop offset="30%"  stopColor={colors.primary} stopOpacity="0.55" />
                <Stop offset="60%"  stopColor={colors.primary} stopOpacity="0.12" />
                <Stop offset="100%" stopColor={colors.primary} stopOpacity="0"   />
              </RadialGradient>
            </Defs>
            <Circle cx={cx} cy={cy} r={cx * 0.42} fill="url(#orbGrad)" />
          </Svg>
        </Animated.View>

        {/* Inner bright core */}
        <View style={{
          position: 'absolute',
          width: size * 0.22, height: size * 0.22, borderRadius: size * 0.11,
          backgroundColor: colors.primary,
          top: cx - size * 0.11, left: cx - size * 0.11,
          shadowColor: colors.accent, shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 1, shadowRadius: 20, elevation: 16,
        }} />

        {/* White center highlight */}
        <View style={{
          position: 'absolute',
          width: size * 0.1, height: size * 0.1, borderRadius: size * 0.05,
          backgroundColor: '#ffffff',
          top: cx - size * 0.05, left: cx - size * 0.05,
          opacity: 0.95,
        }} />
      </View>

      {/* ── Corner tick marks ── */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Svg width={outerSize} height={outerSize}>
          {(() => {
            const ox = half - size / 2;
            const oy = half - size / 2;
            const tl = size * 0.12;
            return (
              <>
                <Line x1={ox-7} y1={oy}      x2={ox-7+tl}    y2={oy}         stroke={SILVER} strokeWidth={1.2} opacity={0.7} />
                <Line x1={ox}   y1={oy-7}    x2={ox}          y2={oy-7+tl}    stroke={SILVER} strokeWidth={1.2} opacity={0.7} />
                <Line x1={ox+size+7} y1={oy} x2={ox+size+7-tl} y2={oy}       stroke={SILVER} strokeWidth={1.2} opacity={0.7} />
                <Line x1={ox+size} y1={oy-7} x2={ox+size}    y2={oy-7+tl}    stroke={SILVER} strokeWidth={1.2} opacity={0.7} />
                <Line x1={ox-7} y1={oy+size} x2={ox-7+tl}    y2={oy+size}    stroke={SILVER} strokeWidth={1.2} opacity={0.7} />
                <Line x1={ox}   y1={oy+size+7} x2={ox}        y2={oy+size+7-tl} stroke={SILVER} strokeWidth={1.2} opacity={0.7} />
                <Line x1={ox+size+7} y1={oy+size} x2={ox+size+7-tl} y2={oy+size} stroke={SILVER} strokeWidth={1.2} opacity={0.7} />
                <Line x1={ox+size} y1={oy+size+7} x2={ox+size} y2={oy+size+7-tl} stroke={SILVER} strokeWidth={1.2} opacity={0.7} />
              </>
            );
          })()}
        </Svg>
      </View>

      {/* ── Active bottom accent ── */}
      <View style={{
        position: 'absolute',
        width: size * 0.5,
        height: 2,
        backgroundColor: colors.accent,
        bottom: half - size / 2 - 10,
        borderRadius: 1,
        opacity: isActive ? 1 : 0.4,
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 10,
        shadowOpacity: isActive ? 1 : 0.3,
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
  orb: {},
});
