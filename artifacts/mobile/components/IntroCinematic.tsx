/**
 * IntroCinematic — shown on first launch.
 *
 * A cinematic sequence of animated text panels with parallax rain, leading
 * to a logo reveal.  Uses only Reanimated + React Native Animated (no 3rd
 * party deps beyond what is already installed).
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Platform,
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
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';

const { width: W, height: H } = Dimensions.get('window');

// ─── Scene definitions ────────────────────────────────────────────────────────
const SCENES = [
  {
    id: 'heritage',
    text: 'Il y a bien longtemps…',
    sub: 'votre père était le forgeron le plus réputé du royaume.',
    delay: 400,
  },
  {
    id: 'abandonne',
    text: "Mais la forge est à l'abandon.",
    sub: 'Les braises se sont éteintes. Les enclumes rouillent.',
    delay: 400,
  },
  {
    id: 'viellard',
    text: "Un soir, un vieux forgeron frappe à votre porte\u2026",
    sub: "\u00ab\u00a0Ce marteau appartenait à votre père. Il est temps de rallumer la flamme.\u00a0\u00bb",
    delay: 400,
  },
  {
    id: 'marteau',
    text: '⚒',
    sub: 'Il vous tend le marteau de votre père.',
    delay: 400,
    bigIcon: true,
  },
  {
    id: 'logo',
    text: 'FORGE & KINGDOMS',
    sub: 'Votre légende commence maintenant.',
    delay: 200,
    isLogo: true,
  },
];

const SCENE_DURATION = 2800; // ms per scene before auto-advance
const TRANSITION_MS = 600;   // fade out duration

// ─── Rain particle (static positions, animated via Y) ─────────────────────────
const RAIN_COUNT = 30;
const rainDrops = Array.from({ length: RAIN_COUNT }, (_, i) => ({
  x: Math.random() * W,
  delay: Math.random() * 1500,
  speed: 1200 + Math.random() * 600,
  opacity: 0.04 + Math.random() * 0.1,
  height: 14 + Math.random() * 20,
}));

function RainDrop({ x, delay, speed, opacity: op, height }: (typeof rainDrops)[0]) {
  const y = useSharedValue(-50);

  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(H + 50, { duration: speed, easing: Easing.linear }),
          withTiming(-50, { duration: 0 }),
        ),
        -1,
      ),
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.rainDrop,
        animStyle,
        { left: x, height, opacity: op },
      ]}
    />
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
interface Props {
  onFinish: () => void;
}

function ScenePanel({
  scene,
  active,
}: {
  scene: (typeof SCENES)[0];
  active: boolean;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(30);

  useEffect(() => {
    if (active) {
      opacity.value = withDelay(
        scene.delay,
        withTiming(1, { duration: TRANSITION_MS, easing: Easing.out(Easing.cubic) }),
      );
      translateY.value = withDelay(
        scene.delay,
        withTiming(0, { duration: TRANSITION_MS, easing: Easing.out(Easing.cubic) }),
      );
    } else {
      opacity.value = withTiming(0, { duration: TRANSITION_MS / 2 });
      translateY.value = withTiming(-20, { duration: TRANSITION_MS / 2 });
    }
  }, [active]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  if (scene.isLogo) {
    return (
      <Animated.View style={[styles.sceneContent, animStyle]}>
        <Text style={styles.logoTitle}>{scene.text}</Text>
        <View style={styles.logoDivider} />
        <Text style={styles.logoSub}>{scene.sub}</Text>
      </Animated.View>
    );
  }

  if (scene.bigIcon) {
    return (
      <Animated.View style={[styles.sceneContent, animStyle]}>
        <Text style={styles.bigIcon}>{scene.text}</Text>
        <Text style={styles.sceneSub}>{scene.sub}</Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.sceneContent, animStyle]}>
      <Text style={styles.sceneText}>{scene.text}</Text>
      <Text style={styles.sceneSub}>{scene.sub}</Text>
    </Animated.View>
  );
}

export default function IntroCinematic({ onFinish }: Props) {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const bgOpacity = useSharedValue(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Advance scene or finish
  const advance = () => {
    if (finishing) return;
    const next = sceneIndex + 1;
    if (next >= SCENES.length) {
      doFinish();
    } else {
      setSceneIndex(next);
    }
  };

  const doFinish = () => {
    if (finishing) return;
    setFinishing(true);
    bgOpacity.value = withTiming(0, { duration: 700, easing: Easing.in(Easing.cubic) }, () => {
      'worklet';
    });
    setTimeout(onFinish, 750);
  };

  // Auto-advance timer
  useEffect(() => {
    if (finishing) return;
    timerRef.current = setTimeout(() => {
      advance();
    }, SCENE_DURATION);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [sceneIndex, finishing]);

  const bgStyle = useAnimatedStyle(() => ({ opacity: bgOpacity.value }));

  // Pulsing "tap" indicator (last scene)
  const tapOpacity = useSharedValue(0);
  useEffect(() => {
    if (sceneIndex === SCENES.length - 1) {
      tapOpacity.value = withDelay(
        1200,
        withRepeat(
          withSequence(
            withTiming(1, { duration: 700 }),
            withTiming(0.3, { duration: 700 }),
          ),
          -1,
        ),
      );
    } else {
      tapOpacity.value = 0;
    }
  }, [sceneIndex]);
  const tapStyle = useAnimatedStyle(() => ({ opacity: tapOpacity.value }));

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, bgStyle]}>
      <StatusBar style="light" />

      {/* Gradient background */}
      <LinearGradient
        colors={['#0A0810', '#120C1C', '#0A0810']}
        style={StyleSheet.absoluteFill}
      />

      {/* Rain particles */}
      {Platform.OS === 'web' && rainDrops.map((drop, i) => (
        <RainDrop key={i} {...drop} />
      ))}

      {/* Scenes */}
      <View style={styles.scenesWrap}>
        {SCENES.map((scene, i) => (
          <View key={scene.id} style={StyleSheet.absoluteFill} pointerEvents="none">
            <ScenePanel scene={scene} active={i === sceneIndex} />
          </View>
        ))}
      </View>

      {/* Tap hint on last scene */}
      <Animated.View style={[styles.tapHint, tapStyle]} pointerEvents="none">
        <Text style={styles.tapText}>Appuyez pour commencer</Text>
      </Animated.View>

      {/* Tap to advance (full screen) */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={advance}
      />

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
    backgroundColor: '#0A0810',
  },
  rainDrop: {
    position: 'absolute',
    width: 1.5,
    backgroundColor: '#9BB8E8',
    borderRadius: 1,
  },
  scenesWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  sceneContent: {
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  sceneText: {
    fontSize: 26,
    fontWeight: '700',
    color: '#F0E8FF',
    textAlign: 'center',
    lineHeight: 36,
    letterSpacing: 0.5,
  },
  sceneSub: {
    fontSize: 15,
    color: '#8A7A9A',
    textAlign: 'center',
    lineHeight: 22,
    fontStyle: 'italic',
  },
  bigIcon: {
    fontSize: 72,
    textAlign: 'center',
  },
  logoTitle: {
    fontSize: 30,
    fontWeight: '900',
    color: '#E8A83A',
    textAlign: 'center',
    letterSpacing: 4,
  },
  logoDivider: {
    width: 80,
    height: 2,
    backgroundColor: '#E8A83A',
    borderRadius: 1,
    opacity: 0.6,
    marginVertical: 4,
  },
  logoSub: {
    fontSize: 14,
    color: '#B0A0C0',
    textAlign: 'center',
    letterSpacing: 1,
    fontStyle: 'italic',
  },
  tapHint: {
    position: 'absolute',
    bottom: 80,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  tapText: {
    fontSize: 13,
    color: '#6A5A7A',
    letterSpacing: 1.5,
  },
  skipBtn: {
    position: 'absolute',
    top: 52,
    right: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  skipText: {
    fontSize: 13,
    color: '#8A7A9A',
    letterSpacing: 1,
  },
});
