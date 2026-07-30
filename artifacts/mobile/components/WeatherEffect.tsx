/**
 * WeatherEffect — 2-D overlay weather particles rendered over the 3-D forge scene.
 *
 * Supported types: 'none' | 'rain' | 'snow' | 'fog'
 * Implemented entirely with Reanimated + React Native, no Three.js changes needed.
 */
import React, { useEffect } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export type WeatherType = 'none' | 'rain' | 'snow' | 'fog';

const { width: W, height: H } = Dimensions.get('window');

// ─── Rain drop ────────────────────────────────────────────────────────────────
interface RainDropCfg {
  x: number;
  delay: number;
  speed: number;
  opacity: number;
  length: number;
}

function RainDrop({ x, delay, speed, opacity: op, length }: RainDropCfg) {
  const y = useSharedValue(-50);
  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(H + 60, { duration: speed, easing: Easing.linear }),
          withTiming(-60, { duration: 0 }),
        ),
        -1,
      ),
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { rotate: '15deg' }],
  }));
  return (
    <Animated.View
      style={[
        styles.rainDrop,
        style,
        { left: x, height: length, opacity: op },
      ]}
    />
  );
}

// ─── Snow flake ───────────────────────────────────────────────────────────────
interface SnowFlakeCfg {
  x: number;
  delay: number;
  speed: number;
  opacity: number;
  size: number;
  drift: number;
}

function SnowFlake({ x, delay, speed, opacity: op, size, drift }: SnowFlakeCfg) {
  const y = useSharedValue(-20);
  const tx = useSharedValue(0);
  useEffect(() => {
    y.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(H + 20, { duration: speed, easing: Easing.linear }),
          withTiming(-20, { duration: 0 }),
        ),
        -1,
      ),
    );
    tx.value = withRepeat(
      withSequence(
        withTiming(drift, { duration: speed * 0.4, easing: Easing.inOut(Easing.sin) }),
        withTiming(-drift, { duration: speed * 0.4, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }, { translateX: tx.value }],
  }));
  return (
    <Animated.View
      style={[
        styles.snowFlake,
        style,
        { left: x, width: size, height: size, borderRadius: size / 2, opacity: op },
      ]}
    />
  );
}

// ─── Fog layer ────────────────────────────────────────────────────────────────
function FogLayer({ index }: { index: number }) {
  const translateX = useSharedValue(index % 2 === 0 ? -W * 0.3 : W * 0.3);
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withDelay(
      index * 600,
      withRepeat(
        withSequence(
          withTiming(0.07 + index * 0.015, { duration: 3000 }),
          withTiming(0.03, { duration: 3000 }),
        ),
        -1,
      ),
    );
    translateX.value = withRepeat(
      withSequence(
        withTiming(index % 2 === 0 ? W * 0.1 : -W * 0.1, {
          duration: 8000 + index * 2000,
          easing: Easing.inOut(Easing.sin),
        }),
        withTiming(index % 2 === 0 ? -W * 0.3 : W * 0.3, {
          duration: 8000 + index * 2000,
          easing: Easing.inOut(Easing.sin),
        }),
      ),
      -1,
    );
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }],
  }));
  return (
    <Animated.View
      style={[
        styles.fogLayer,
        style,
        { top: H * 0.2 * index, height: H * 0.35 },
      ]}
    />
  );
}

// ─── Seeded generators ────────────────────────────────────────────────────────
const RAIN_DROPS: RainDropCfg[] = Array.from({ length: 40 }, (_, i) => ({
  x: (i * 23.7) % W,
  delay: (i * 137) % 1800,
  speed: 900 + ((i * 57) % 500),
  opacity: 0.04 + ((i * 13) % 10) / 100,
  length: 12 + ((i * 7) % 18),
}));

const SNOW_FLAKES: SnowFlakeCfg[] = Array.from({ length: 30 }, (_, i) => ({
  x: (i * 31.1) % W,
  delay: (i * 211) % 3000,
  speed: 3500 + ((i * 97) % 2000),
  opacity: 0.25 + ((i * 17) % 30) / 100,
  size: 3 + ((i * 5) % 5),
  drift: 10 + ((i * 11) % 20),
}));

// ─── Main export ──────────────────────────────────────────────────────────────
interface Props {
  type: WeatherType;
}

export default function WeatherEffect({ type }: Props) {
  if (type === 'none') return null;

  return (
    <View style={styles.container} pointerEvents="none">
      {type === 'rain' &&
        RAIN_DROPS.map((d, i) => <RainDrop key={i} {...d} />)}

      {type === 'snow' &&
        SNOW_FLAKES.map((f, i) => <SnowFlake key={i} {...f} />)}

      {type === 'fog' && [0, 1, 2].map((i) => <FogLayer key={i} index={i} />)}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  rainDrop: {
    position: 'absolute',
    width: 1.5,
    backgroundColor: '#9BB8E8',
    borderRadius: 1,
  },
  snowFlake: {
    position: 'absolute',
    backgroundColor: '#E8F4FF',
  },
  fogLayer: {
    position: 'absolute',
    left: -W * 0.3,
    width: W * 1.6,
    backgroundColor: '#6080A0',
  },
});
