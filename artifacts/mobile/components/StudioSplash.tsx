/**
 * StudioSplash — écran d'introduction animé du studio au lancement.
 * Marteau qui « frappe » le logo, halo de braise, puis fondu de sortie.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { STUDIO } from '@/constants/studio';

export default function StudioSplash({ onDone }: { onDone: () => void }) {
  const hammerDrop = useRef(new Animated.Value(-80)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const rootOpacity = useRef(new Animated.Value(1)).current;
  const doneRef = useRef(false);

  useEffect(() => {
    Animated.sequence([
      // Le marteau tombe
      Animated.timing(hammerDrop, {
        toValue: 0,
        duration: 450,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      // Impact : halo de braise + titre
      Animated.parallel([
        Animated.timing(glow, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(textOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      ]),
      Animated.delay(1200),
      // Fondu de sortie
      Animated.timing(rootOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => {
      if (!doneRef.current) {
        doneRef.current = true;
        onDone();
      }
    });
    const impactTimer = setTimeout(() => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    }, 450);
    return () => clearTimeout(impactTimer);
  }, [hammerDrop, glow, textOpacity, rootOpacity, onDone]);

  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.6] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, 0.7, 0.35] });

  return (
    <Animated.View style={[styles.root, { opacity: rootOpacity }]} pointerEvents="none">
      <View style={styles.center}>
        <Animated.View style={[styles.glow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
        <Animated.View style={{ transform: [{ translateY: hammerDrop }] }}>
          <Feather name="tool" size={54} color={STUDIO.gold} />
        </Animated.View>
        <Animated.View style={{ opacity: textOpacity, alignItems: 'center' }}>
          <Text style={styles.name}>BRAISE NOIRE</Text>
          <Text style={styles.sub}>STUDIOS</Text>
          <Text style={styles.tagline}>{STUDIO.tagline}</Text>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: STUDIO.coal,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 9999,
  },
  center: { alignItems: 'center', gap: 18 },
  glow: {
    position: 'absolute',
    top: -30,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: STUDIO.gold,
  },
  name: { color: STUDIO.parchment, fontSize: 26, fontWeight: '900', letterSpacing: 6, marginTop: 6 },
  sub: { color: STUDIO.gold, fontSize: 12, fontWeight: '800', letterSpacing: 8, marginTop: 2 },
  tagline: { color: '#6B6152', fontSize: 11, marginTop: 12, fontStyle: 'italic' },
});
