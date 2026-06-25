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
import Svg, { Circle, Defs, Line, RadialGradient, Stop } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

const SILVER = '#7A99B4';
const CHROME = '#B0C8D8';

interface JarvisOrbProps {
  isActive: boolean;
  size?: number;
}

export function JarvisOrb({ isActive, size = 120 }: JarvisOrbProps) {
  const colors = useColors();

  const ring0 = useSharedValue(0);
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);

  const rotFwd = useSharedValue(0);     // inner dashed ring: forward
  const rotRev = useSharedValue(0);     // outer silver ring: reverse
  const rotMid = useSharedValue(0);     // mid ring: forward fast
  const coreGlow = useSharedValue(0.7);
  const coreScale = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(ring0);
    cancelAnimation(ring1);
    cancelAnimation(ring2);
    cancelAnimation(rotFwd);
    cancelAnimation(rotRev);
    cancelAnimation(rotMid);
    cancelAnimation(coreGlow);
    cancelAnimation(coreScale);

    ring0.value = 0;
    ring1.value = 0;
    ring2.value = 0;
    rotFwd.value = 0;
    rotRev.value = 0;
    rotMid.value = 0;

    const dur = isActive ? 900 : 2400;

    // Pulse rings
    ring0.value = withRepeat(withTiming(1, { duration: dur, easing: Easing.out(Easing.ease) }), -1, false);
    ring1.value = withDelay(dur / 3, withRepeat(withTiming(1, { duration: dur, easing: Easing.out(Easing.ease) }), -1, false));
    ring2.value = withDelay((dur / 3) * 2, withRepeat(withTiming(1, { duration: dur, easing: Easing.out(Easing.ease) }), -1, false));

    // Outer silver ring: slow reverse
    rotRev.value = withRepeat(
      withTiming(-360, { duration: isActive ? 7000 : 18000, easing: Easing.linear }),
      -1, false
    );

    // Inner blue dashed ring: forward
    rotFwd.value = withRepeat(
      withTiming(360, { duration: isActive ? 3000 : 9000, easing: Easing.linear }),
      -1, false
    );

    // Mid ring: forward faster
    rotMid.value = withRepeat(
      withTiming(360, { duration: isActive ? 5000 : 13000, easing: Easing.linear }),
      -1, false
    );

    // Core breathing
    coreGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: dur * 0.5, easing: Easing.inOut(Easing.ease) }),
        withTiming(isActive ? 0.72 : 0.48, { duration: dur * 0.5, easing: Easing.inOut(Easing.ease) })
      ),
      -1, false
    );

    coreScale.value = withRepeat(
      withSequence(
        withTiming(1.08, { duration: dur * 0.5, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: dur * 0.5, easing: Easing.inOut(Easing.ease) })
      ),
      -1, false
    );

    return () => {
      cancelAnimation(ring0);
      cancelAnimation(ring1);
      cancelAnimation(ring2);
      cancelAnimation(rotFwd);
      cancelAnimation(rotRev);
      cancelAnimation(rotMid);
      cancelAnimation(coreGlow);
      cancelAnimation(coreScale);
    };
  }, [isActive]);

  const ring0Style = useAnimatedStyle(() => ({
    opacity: interpolate(ring0.value, [0, 0.18, 1], [0, 0.7, 0]),
    transform: [{ scale: interpolate(ring0.value, [0, 1], [1, 2.1]) }],
  }));

  const ring1Style = useAnimatedStyle(() => ({
    opacity: interpolate(ring1.value, [0, 0.18, 1], [0, 0.42, 0]),
    transform: [{ scale: interpolate(ring1.value, [0, 1], [1, 2.6]) }],
  }));

  const ring2Style = useAnimatedStyle(() => ({
    opacity: interpolate(ring2.value, [0, 0.18, 1], [0, 0.22, 0]),
    transform: [{ scale: interpolate(ring2.value, [0, 1], [1, 3.1]) }],
  }));

  const rotRevStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotRev.value}deg` }],
  }));

  const rotFwdStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotFwd.value}deg` }],
  }));

  const rotMidStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotMid.value}deg` }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    opacity: coreGlow.value,
    transform: [{ scale: coreScale.value }],
  }));

  const outerSize = size * 3.0;
  const half = outerSize / 2;

  const ringBase = {
    position: 'absolute' as const,
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: 1,
    top: half - size / 2,
    left: half - size / 2,
  };

  // Corner tick coordinates relative to outerSize SVG
  const ox = half - size / 2;  // orb x origin
  const oy = half - size / 2;  // orb y origin
  const tl = size * 0.11;      // tick length

  return (
    <View style={{ width: outerSize, height: outerSize, alignItems: 'center', justifyContent: 'center' }}>

      {/* ── Expanding pulse rings ── */}
      <Animated.View style={[ringBase, { borderColor: colors.primary + 'cc' }, ring0Style]} />
      <Animated.View style={[ringBase, { borderColor: colors.primary + '66' }, ring1Style]} />
      <Animated.View style={[ringBase, { borderColor: colors.accent + '33' }, ring2Style]} />

      {/* ── Orb body ── */}
      <View style={[styles.orb, { width: size, height: size, borderRadius: size / 2 }]}>

        {/* Deep black base */}
        <View style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2, backgroundColor: '#030609' }]} />

        {/* Ambient glow */}
        <View style={[StyleSheet.absoluteFillObject, { borderRadius: size / 2, backgroundColor: colors.primary + '0E' }]} />

        {/* Outer silver ring — slow reverse rotation */}
        <Animated.View style={[StyleSheet.absoluteFillObject, rotRevStyle]}>
          <Svg width={size} height={size}>
            <Circle
              cx={size / 2} cy={size / 2}
              r={size / 2 - 2}
              fill="none"
              stroke={SILVER}
              strokeWidth={1}
              strokeDasharray="2 9"
              opacity={0.55}
            />
          </Svg>
        </Animated.View>

        {/* Mid blue ring — medium forward rotation */}
        <Animated.View style={[StyleSheet.absoluteFillObject, rotMidStyle]}>
          <Svg width={size} height={size}>
            <Circle
              cx={size / 2} cy={size / 2}
              r={size * 0.43}
              fill="none"
              stroke={colors.primary}
              strokeWidth={1}
              strokeDasharray="8 6"
              opacity={0.35}
            />
          </Svg>
        </Animated.View>

        {/* Inner cyan dashed ring — fast forward rotation */}
        <Animated.View style={[StyleSheet.absoluteFillObject, rotFwdStyle]}>
          <Svg width={size} height={size}>
            <Circle
              cx={size / 2} cy={size / 2}
              r={size * 0.33}
              fill="none"
              stroke={colors.accent}
              strokeWidth={1.5}
              strokeDasharray="5 4"
              opacity={0.75}
            />
          </Svg>
        </Animated.View>

        {/* Static inner border ring */}
        <View style={[StyleSheet.absoluteFillObject, {
          borderRadius: size / 2,
          borderWidth: 1,
          borderColor: colors.accent + '25',
        }]} />

        {/* Core radial glow */}
        <Animated.View style={[StyleSheet.absoluteFillObject, coreStyle]}>
          <Svg width={size} height={size}>
            <Defs>
              <RadialGradient id="orbGrad" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
                <Stop offset="15%" stopColor={colors.accent} stopOpacity="0.85" />
                <Stop offset="35%" stopColor={colors.primary} stopOpacity="0.5" />
                <Stop offset="65%" stopColor={colors.primary} stopOpacity="0.1" />
                <Stop offset="100%" stopColor={colors.primary} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Circle cx={size / 2} cy={size / 2} r={size * 0.34} fill="url(#orbGrad)" />
          </Svg>
        </Animated.View>

        {/* Cross / reticle lines */}
        <View style={StyleSheet.absoluteFillObject}>
          <Svg width={size} height={size}>
            {/* Horizontal left segment */}
            <Line x1={size * 0.16} y1={size / 2} x2={size * 0.38} y2={size / 2}
              stroke={colors.accent} strokeWidth={0.8} opacity={0.45} />
            {/* Horizontal right segment */}
            <Line x1={size * 0.62} y1={size / 2} x2={size * 0.84} y2={size / 2}
              stroke={colors.accent} strokeWidth={0.8} opacity={0.45} />
            {/* Vertical top segment */}
            <Line x1={size / 2} y1={size * 0.16} x2={size / 2} y2={size * 0.38}
              stroke={colors.accent} strokeWidth={0.8} opacity={0.45} />
            {/* Vertical bottom segment */}
            <Line x1={size / 2} y1={size * 0.62} x2={size / 2} y2={size * 0.84}
              stroke={colors.accent} strokeWidth={0.8} opacity={0.45} />
          </Svg>
        </View>

        {/* Bright inner core */}
        <View style={[styles.innerCore, {
          width: size * 0.20,
          height: size * 0.20,
          borderRadius: size * 0.10,
          backgroundColor: colors.primary,
          shadowColor: colors.accent,
          top: size * 0.40,
          left: size * 0.40,
        }]} />

        {/* White center highlight */}
        <View style={[styles.centerDot, {
          width: size * 0.09,
          height: size * 0.09,
          borderRadius: size * 0.045,
          top: size * 0.455,
          left: size * 0.455,
        }]} />
      </View>

      {/* ── Corner tick marks (SVG overlay, full outerSize) ── */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <Svg width={outerSize} height={outerSize}>
          {/* Top-left */}
          <Line x1={ox - 6} y1={oy} x2={ox - 6 + tl} y2={oy} stroke={SILVER} strokeWidth={1} opacity={0.6} />
          <Line x1={ox} y1={oy - 6} x2={ox} y2={oy - 6 + tl} stroke={SILVER} strokeWidth={1} opacity={0.6} />
          {/* Top-right */}
          <Line x1={ox + size + 6} y1={oy} x2={ox + size + 6 - tl} y2={oy} stroke={SILVER} strokeWidth={1} opacity={0.6} />
          <Line x1={ox + size} y1={oy - 6} x2={ox + size} y2={oy - 6 + tl} stroke={SILVER} strokeWidth={1} opacity={0.6} />
          {/* Bottom-left */}
          <Line x1={ox - 6} y1={oy + size} x2={ox - 6 + tl} y2={oy + size} stroke={SILVER} strokeWidth={1} opacity={0.6} />
          <Line x1={ox} y1={oy + size + 6} x2={ox} y2={oy + size + 6 - tl} stroke={SILVER} strokeWidth={1} opacity={0.6} />
          {/* Bottom-right */}
          <Line x1={ox + size + 6} y1={oy + size} x2={ox + size + 6 - tl} y2={oy + size} stroke={SILVER} strokeWidth={1} opacity={0.6} />
          <Line x1={ox + size} y1={oy + size + 6} x2={ox + size} y2={oy + size + 6 - tl} stroke={SILVER} strokeWidth={1} opacity={0.6} />
        </Svg>
      </View>

      {/* ── Bottom accent bar (active indicator) ── */}
      <View style={{
        position: 'absolute',
        width: size * 0.45,
        height: 2,
        backgroundColor: colors.accent,
        bottom: half - size / 2 - 8,
        borderRadius: 1,
        opacity: isActive ? 1 : 0.35,
        shadowColor: colors.accent,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 8,
        shadowOpacity: isActive ? 0.9 : 0.3,
      }} />
    </View>
  );
}

const styles = StyleSheet.create({
  orb: {
    overflow: 'hidden',
  },
  innerCore: {
    position: 'absolute',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 12,
    opacity: 0.9,
  },
  centerDot: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    opacity: 0.95,
  },
});
