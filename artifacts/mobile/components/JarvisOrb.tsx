import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { useColors } from '@/hooks/useColors';

interface JarvisOrbProps {
  isActive: boolean;
  size?: number;
}

export function JarvisOrb({ isActive, size = 120 }: JarvisOrbProps) {
  const colors = useColors();

  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const pulse3 = useRef(new Animated.Value(0)).current;
  const coreGlow = useRef(new Animated.Value(0.6)).current;
  const rotation = useRef(new Animated.Value(0)).current;

  const duration = isActive ? 900 : 2200;

  useEffect(() => {
    const createRingAnim = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );

    const ring1 = createRingAnim(pulse1, 0);
    const ring2 = createRingAnim(pulse2, duration / 3);
    const ring3 = createRingAnim(pulse3, (duration / 3) * 2);

    const glowAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(coreGlow, {
          toValue: 1,
          duration: duration / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(coreGlow, {
          toValue: isActive ? 0.7 : 0.5,
          duration: duration / 2,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    const rotAnim = Animated.loop(
      Animated.timing(rotation, {
        toValue: 1,
        duration: isActive ? 3000 : 8000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    ring1.start();
    ring2.start();
    ring3.start();
    glowAnim.start();
    rotAnim.start();

    return () => {
      ring1.stop();
      ring2.stop();
      ring3.stop();
      glowAnim.stop();
      rotAnim.stop();
    };
  }, [isActive, duration]);

  const makeRingStyle = (val: Animated.Value, maxScale: number) => ({
    opacity: val.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.8, 0.4, 0] }),
    transform: [
      {
        scale: val.interpolate({
          inputRange: [0, 1],
          outputRange: [1, maxScale],
        }),
      },
    ],
  });

  const rotationDeg = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const orbSize = size;
  const coreSize = orbSize * 0.45;

  return (
    <View style={[styles.container, { width: orbSize * 2.5, height: orbSize * 2.5 }]}>
      {/* Pulse rings */}
      <Animated.View
        style={[
          styles.ring,
          { width: orbSize, height: orbSize, borderRadius: orbSize / 2, borderColor: colors.primary },
          makeRingStyle(pulse1, 2.2),
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          { width: orbSize, height: orbSize, borderRadius: orbSize / 2, borderColor: colors.primary },
          makeRingStyle(pulse2, 2.2),
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          { width: orbSize, height: orbSize, borderRadius: orbSize / 2, borderColor: colors.primary },
          makeRingStyle(pulse3, 2.2),
        ]}
      />

      {/* Rotating arc ring */}
      <Animated.View
        style={[
          styles.arcRing,
          {
            width: orbSize * 1.15,
            height: orbSize * 1.15,
            borderRadius: (orbSize * 1.15) / 2,
            borderColor: colors.primary,
            transform: [{ rotate: rotationDeg }],
          },
        ]}
      />

      {/* Outer static ring */}
      <View
        style={[
          styles.staticRing,
          {
            width: orbSize * 1.02,
            height: orbSize * 1.02,
            borderRadius: (orbSize * 1.02) / 2,
            borderColor: colors.primary + '40',
          },
        ]}
      />

      {/* Core */}
      <Animated.View
        style={[
          styles.core,
          {
            width: coreSize,
            height: coreSize,
            borderRadius: coreSize / 2,
            backgroundColor: colors.primary,
            opacity: coreGlow,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 1,
            shadowRadius: 20,
          },
        ]}
      />

      {/* Inner glow dot */}
      <View
        style={[
          styles.innerDot,
          {
            width: coreSize * 0.5,
            height: coreSize * 0.5,
            borderRadius: coreSize * 0.25,
            backgroundColor: '#ffffff',
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  arcRing: {
    position: 'absolute',
    borderWidth: 1.5,
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  staticRing: {
    position: 'absolute',
    borderWidth: 1,
  },
  core: {
    position: 'absolute',
    elevation: 10,
  },
  innerDot: {
    position: 'absolute',
    opacity: 0.9,
  },
});
