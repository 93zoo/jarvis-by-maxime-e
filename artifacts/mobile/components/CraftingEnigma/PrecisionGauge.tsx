/**
 * PrecisionGauge — oscillating needle, tap STOP when it enters the target zone.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

interface Props {
  difficulty: 1 | 2 | 3;
  /** Additive zone-width bonus from the forge_enigma_master talent (0–1). */
  enigmaZoneBonus: number;
  onSuccess: () => void;
  onFail: () => void;
}

export default function PrecisionGauge({ difficulty, enigmaZoneBonus, onSuccess, onFail }: Props) {
  const { width } = useWindowDimensions();
  const BAR_W = width - 96; // pixels

  // Zone width as a fraction of the bar
  const BASE_ZONE = [0.30, 0.22, 0.14][difficulty - 1];
  const zoneWidthFrac = Math.min(0.75, BASE_ZONE * (1 + enigmaZoneBonus));

  // Random zone center, keeping zone fully inside the bar
  const [zoneLeftFrac] = useState(() => {
    const half = zoneWidthFrac / 2;
    return 0.08 + Math.random() * (0.84 - zoneWidthFrac);
  });

  // Oscillation speed: faster = harder
  const DURATION = [850, 620, 430][difficulty - 1]; // ms per half-swing

  const needleNorm = useSharedValue(0); // 0 → 1 representing bar position
  const [stopped, setStopped] = useState(false);
  const [result, setResult] = useState<'success' | 'fail' | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    needleNorm.value = withRepeat(
      withSequence(
        withTiming(1, { duration: DURATION, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: DURATION, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: needleNorm.value * BAR_W }],
  }));

  const handleStop = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setStopped(true);

    // Read position synchronously from the shared value
    const pos = needleNorm.value;
    const inZone = pos >= zoneLeftFrac && pos <= zoneLeftFrac + zoneWidthFrac;

    if (inZone) {
      setResult('success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(onSuccess, 1400);
    } else {
      setResult('fail');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setTimeout(onFail, 1400);
    }
  };

  const zoneLeftPx = zoneLeftFrac * BAR_W;
  const zoneWidthPx = zoneWidthFrac * BAR_W;

  return (
    <View style={styles.container}>
      <Text style={styles.instruction}>Arrêtez l'aiguille dans la zone dorée</Text>

      {/* Bar */}
      <View style={{ width: BAR_W, height: 64, position: 'relative', marginVertical: 20 }}>
        {/* Track background */}
        <View style={[styles.track, { width: BAR_W }]} />

        {/* Target zone */}
        <View
          style={[
            styles.zone,
            { left: zoneLeftPx, width: zoneWidthPx },
          ]}
        />

        {/* Needle */}
        <Animated.View style={[styles.needleWrapper, needleStyle, stopped && { opacity: 0.45 }]}>
          <View style={styles.needle} />
        </Animated.View>

        {/* Result overlay */}
        {result && (
          <View
            style={[
              styles.resultBadge,
              { backgroundColor: result === 'success' ? '#1B5E20CC' : '#B71C1CCC' },
            ]}
          >
            <Text style={styles.resultTxt}>
              {result === 'success' ? '✓  DANS LA ZONE !' : '✗  RATÉ'}
            </Text>
          </View>
        )}
      </View>

      {/* STOP button */}
      <TouchableOpacity
        style={[styles.stopBtn, stopped && { opacity: 0.35 }]}
        onPress={handleStop}
        disabled={stopped}
        activeOpacity={0.8}
      >
        <Text style={styles.stopTxt}>STOP</Text>
      </TouchableOpacity>

      {/* Difficulty hint */}
      {!stopped && (
        <Text style={styles.hint}>
          {['Zone large', 'Zone étroite', 'Zone très étroite'][difficulty - 1]}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 4, width: '100%' },
  instruction: { fontSize: 14, fontWeight: '700', color: '#F2E4C4', textAlign: 'center' },
  track: {
    position: 'absolute',
    top: 24, height: 16, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)',
  },
  zone: {
    position: 'absolute',
    top: 24, height: 16, borderRadius: 6,
    backgroundColor: '#E8B84B44',
    borderWidth: 2, borderColor: '#E8B84B',
  },
  needleWrapper: {
    position: 'absolute',
    top: 10,
    left: -2,
    width: 4,
    height: 44,
  },
  needle: {
    width: 4, height: 44, borderRadius: 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 4,
  },
  resultBadge: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
  },
  resultTxt: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  stopBtn: {
    marginTop: 8,
    paddingHorizontal: 40, paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#E8B84B',
  },
  stopTxt: { fontSize: 18, fontWeight: '900', color: '#0D0A07', letterSpacing: 2 },
  hint: { fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 4 },
});
