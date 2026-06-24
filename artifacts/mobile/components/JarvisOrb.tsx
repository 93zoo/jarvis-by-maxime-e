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
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';

interface JarvisOrbProps {
  isActive: boolean;
  size?: number;
}

export function JarvisOrb({ isActive, size = 120 }: JarvisOrbProps) {
  const colors = useColors();

  // ── Shared values ──────────────────────────────────────────────────────────
  const ring0 = useSharedValue(0);
  const ring1 = useSharedValue(0);
  const ring2 = useSharedValue(0);

  const rotation = useSharedValue(0);
  const coreGlow = useSharedValue(0.7);
  const coreScale = useSharedValue(1);

  // ── Animations ─────────────────────────────────────────────────────────────
  useEffect(() => {
    cancelAnimation(ring0);
    cancelAnimation(ring1);
    cancelAnimation(ring2);
    cancelAnimation(rotation);
    cancelAnimation(coreGlow);
    cancelAnimation(coreScale);

    ring0.value = 0;
    ring1.value = 0;
    ring2.value = 0;
    rotation.value = 0;

    const dur = isActive ? 1000 : 2600;

    // Rings — staggered pulse outward
    ring0.value = withRepeat(withTiming(1, { duration: dur, easing: Easing.out(Easing.ease) }), -1, false);
    ring1.value = withDelay(dur / 3, withRepeat(withTiming(1, { duration: dur, easing: Easing.out(Easing.ease) }), -1, false));
    ring2.value = withDelay((dur / 3) * 2, withRepeat(withTiming(1, { duration: dur, easing: Easing.out(Easing.ease) }), -1, false));

    // Outer ring rotation
    rotation.value = withRepeat(
      withTiming(360, { duration: isActive ? 3200 : 9000, easing: Easing.linear }),
      -1,
      false
    );

    // Core breathing
    coreGlow.value = withRepeat(
      withSequence(
        withTiming(1, { duration: dur * 0.5, easing: Easing.inOut(Easing.ease) }),
        withTiming(isActive ? 0.75 : 0.55, { duration: dur * 0.5, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    coreScale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: dur * 0.5, easing: Easing.inOut(Easing.ease) }),
        withTiming(1, { duration: dur * 0.5, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    return () => {
      cancelAnimation(ring0);
      cancelAnimation(ring1);
      cancelAnimation(ring2);
      cancelAnimation(rotation);
      cancelAnimation(coreGlow);
      cancelAnimation(coreScale);
    };
  }, [isActive]);

  // ── Animated styles ─────────────────────────────────────────────────────────
  const ring0Style = useAnimatedStyle(() => ({
    opacity: interpolate(ring0.value, [0, 0.25, 1], [0, 0.7, 0]),
    transform: [{ scale: interpolate(ring0.value, [0, 1], [1, 1.95]) }],
  }));

  const ring1Style = useAnimatedStyle(() => ({
    opacity: interpolate(ring1.value, [0, 0.25, 1], [0, 0.5, 0]),
    transform: [{ scale: interpolate(ring1.value, [0, 1], [1, 2.3]) }],
  }));

  const ring2Style = useAnimatedStyle(() => ({
    opacity: interpolate(ring2.value, [0, 0.25, 1], [0, 0.3, 0]),
    transform: [{ scale: interpolate(ring2.value, [0, 1], [1, 2.7]) }],
  }));

  const rotStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const coreStyle = useAnimatedStyle(() => ({
    opacity: coreGlow.value,
    transform: [{ scale: coreScale.value }],
  }));

  // ── Layout ──────────────────────────────────────────────────────────────────
  // Extra space so expanding rings aren't clipped
  const outerSize = size * 2.8;
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

  return (
    <View style={{ width: outerSize, height: outerSize, alignItems: 'center', justifyContent: 'center' }}>

      {/* ── Expanding pulse rings ── */}
      <Animated.View style={[ringBase, { borderColor: colors.primary + 'cc' }, ring0Style]} />
      <Animated.View style={[ringBase, { borderColor: colors.primary + '99' }, ring1Style]} />
      <Animated.View style={[ringBase, { borderColor: colors.primary + '55' }, ring2Style]} />

      {/* ── Orb body ── */}
      <View style={[styles.orb, { width: size, height: size, borderRadius: size / 2 }]}>

        {/* Halo glow layer */}
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderRadius: size / 2,
              backgroundColor: colors.primary + '14',
            },
          ]}
        />

        {/* Outer faint ring */}
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              borderRadius: size / 2,
              borderWidth: 1,
              borderColor: colors.primary + '50',
            },
          ]}
        />

        {/* Rotating dashed ring */}
        <Animated.View style={[StyleSheet.absoluteFillObject, rotStyle]}>
          <Svg width={size} height={size}>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={size / 2 - 3}
              fill="none"
              stroke={colors.primary}
              strokeWidth={1.5}
              strokeDasharray="6 4"
              opacity={0.55}
            />
          </Svg>
        </Animated.View>

        {/* Core SVG radial glow */}
        <Animated.View style={[StyleSheet.absoluteFillObject, coreStyle]}>
          <Svg width={size} height={size}>
            <Defs>
              <RadialGradient id="orbGrad" cx="50%" cy="50%" r="50%">
                <Stop offset="0%" stopColor={colors.primary} stopOpacity="0.85" />
                <Stop offset="30%" stopColor={colors.primary} stopOpacity="0.45" />
                <Stop offset="65%" stopColor={colors.primary} stopOpacity="0.12" />
                <Stop offset="100%" stopColor={colors.primary} stopOpacity="0" />
              </RadialGradient>
            </Defs>
            <Circle cx={size / 2} cy={size / 2} r={size * 0.42} fill="url(#orbGrad)" />
          </Svg>
        </Animated.View>

        {/* Bright inner core */}
        <View
          style={[
            styles.innerCore,
            {
              width: size * 0.28,
              height: size * 0.28,
              borderRadius: size * 0.14,
              backgroundColor: colors.primary,
              shadowColor: colors.primary,
              top: size * 0.36,
              left: size * 0.36,
            },
          ]}
        />

        {/* Center highlight dot */}
        <View
          style={[
            styles.centerDot,
            {
              width: size * 0.12,
              height: size * 0.12,
              borderRadius: size * 0.06,
              top: size * 0.44,
              left: size * 0.44,
            },
          ]}
        />
      </View>

      {/* ── Bottom accent arc (accent color) ── */}
      <View style={[styles.accentBand, {
        position: 'absolute',
        width: size * 0.5,
        height: 2,
        backgroundColor: colors.accent,
        bottom: half - size / 2 - 6,
        borderRadius: 1,
        opacity: isActive ? 0.9 : 0.4,
      }]} />
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
    shadowOpacity: 0.9,
    shadowRadius: 14,
    elevation: 10,
    opacity: 0.85,
  },
  centerDot: {
    position: 'absolute',
    backgroundColor: '#ffffff',
    opacity: 0.92,
  },
  accentBand: {},
});
