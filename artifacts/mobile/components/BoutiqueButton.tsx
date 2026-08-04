/**
 * BoutiqueButton — small animated shop button (pulsing glow + gentle bounce)
 * shown in the forge header for clear access to the Boutique.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity } from 'react-native';
import Feather from '@/components/Feather';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

const GOLD = '#E8B84B';
const GOLD_DIM = '#8A6A2A';

export default function BoutiqueButton() {
  const router = useRouter();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(600),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.85] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });

  return (
    <TouchableOpacity
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push('/boutique');
      }}
      activeOpacity={0.8}
      hitSlop={8}
      style={styles.wrap}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
      />
      <Animated.View style={[styles.btn, { transform: [{ scale }] }]}>
        <Feather name="shopping-bag" size={14} color="#1A1208" />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', width: 34, height: 34 },
  glow: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: GOLD,
  },
  btn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: GOLD,
    borderWidth: 1,
    borderColor: GOLD_DIM,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
