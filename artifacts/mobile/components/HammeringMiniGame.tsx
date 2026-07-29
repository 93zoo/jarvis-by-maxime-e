/**
 * HammeringMiniGame — Oscillating-needle precision mini-game.
 * The needle swings faster each strike. Tap at the right moment.
 * Calls onStrike(score, label) with each tap; onComplete when 5 strikes done.
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
import { useColors } from '@/hooks/useColors';

export type HitLabel = 'PARFAIT!' | 'EXCELLENT!' | 'TRÈS BIEN' | 'BIEN' | 'RATÉ';

export interface HammeringMiniGameProps {
  strikesCompleted: number;
  strikeScores: number[];
  onStrike: (score: number, label: HitLabel) => void;
  forgeSkillLevel: number;
}

const TOTAL_STRIKES = 5;
const PADDING = 32; // px each side

function scoreFromDeviation(dev: number): { score: number; label: HitLabel } {
  if (dev < 0.04) return { score: 25, label: 'PARFAIT!' };
  if (dev < 0.09) return { score: 20, label: 'EXCELLENT!' };
  if (dev < 0.16) return { score: 14, label: 'TRÈS BIEN' };
  if (dev < 0.24) return { score: 7, label: 'BIEN' };
  return { score: 0, label: 'RATÉ' };
}

function labelColor(label: HitLabel | null, colors: ReturnType<typeof useColors>): string {
  if (!label) return colors.foreground;
  switch (label) {
    case 'PARFAIT!': return '#9966CC';
    case 'EXCELLENT!': return colors.accent;
    case 'TRÈS BIEN': return colors.primary;
    case 'BIEN': return '#4CAF50';
    case 'RATÉ': return colors.destructive;
  }
}

export default function HammeringMiniGame({
  strikesCompleted,
  strikeScores,
  onStrike,
  forgeSkillLevel,
}: HammeringMiniGameProps) {
  const colors = useColors();
  const { width: screenWidth } = useWindowDimensions();
  const barWidth = screenWidth - PADDING * 2;

  // Zone center: randomized between 0.22 and 0.78 each round
  const [perfectCenter] = useState(() => 0.22 + Math.random() * 0.56);

  // Needle position: 0..1 normalised → multiply by barWidth for px
  const needleNorm = useSharedValue(0);

  const [lastHit, setLastHit] = useState<HitLabel | null>(null);
  const hitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Oscillation speed increases with each strike
  useEffect(() => {
    const baseDuration = Math.max(650, 1180 - strikesCompleted * 110);
    needleNorm.value = 0;
    needleNorm.value = withRepeat(
      withSequence(
        withTiming(1, { duration: baseDuration, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: baseDuration, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [strikesCompleted]); // eslint-disable-line react-hooks/exhaustive-deps

  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: needleNorm.value * barWidth - 1.5 }],
  }));

  // Hit label flash animation
  const hitOpacity = useSharedValue(0);
  const hitScale = useSharedValue(0.7);

  const hitLabelStyle = useAnimatedStyle(() => ({
    opacity: hitOpacity.value,
    transform: [{ scale: hitScale.value }],
  }));

  const flashHit = (label: HitLabel) => {
    hitOpacity.value = 1;
    hitScale.value = 1;
    hitOpacity.value = withTiming(0, { duration: 900, easing: Easing.out(Easing.exp) });
    hitScale.value = withTiming(1.25, { duration: 900, easing: Easing.out(Easing.exp) });
  };

  const handleStrike = () => {
    if (strikesCompleted >= TOTAL_STRIKES) return;
    const pos = needleNorm.value; // JS-thread read
    const deviation = Math.abs(pos - perfectCenter);
    const { score, label } = scoreFromDeviation(deviation);

    Haptics.impactAsync(
      score >= 20
        ? Haptics.ImpactFeedbackStyle.Heavy
        : score >= 7
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    );

    setLastHit(label);
    flashHit(label);

    if (hitTimerRef.current) clearTimeout(hitTimerRef.current);
    hitTimerRef.current = setTimeout(() => setLastHit(null), 900);

    onStrike(score, label);
  };

  const totalScore = strikeScores.reduce((a, b) => a + b, 0);
  const maxPossible = strikesCompleted * 25;
  const accuracy = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;

  // Zone pixel positions
  const cPx = perfectCenter * barWidth;
  const PERF_HALF = barWidth * 0.065;
  const EXCEL_HALF = barWidth * 0.13;
  const GOOD_HALF = barWidth * 0.21;

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      {/* Title row */}
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.primary }]}>⚒ MARTELAGE</Text>
        <Text style={[styles.scoreText, { color: colors.accent }]}>
          {totalScore} pts
        </Text>
      </View>

      {/* Strikes progress */}
      <View style={styles.strikesRow}>
        {Array.from({ length: TOTAL_STRIKES }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.strikeDot,
              {
                backgroundColor:
                  i < strikesCompleted
                    ? strikeScores[i] >= 20
                      ? colors.accent
                      : strikeScores[i] >= 7
                      ? colors.primary
                      : colors.destructive
                    : colors.muted,
              },
            ]}
          />
        ))}
        <Text style={[styles.strikeCount, { color: colors.mutedForeground }]}>
          {strikesCompleted}/{TOTAL_STRIKES}
        </Text>
        {strikesCompleted > 0 && (
          <Text style={[styles.accuracyText, { color: colors.accent }]}>
            Précision {accuracy}%
          </Text>
        )}
      </View>

      {/* Needle bar */}
      <View
        style={[
          styles.barContainer,
          { width: barWidth, borderColor: colors.border },
        ]}
      >
        {/* Miss zones (red) */}
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: `${colors.destructive}28` }]} />

        {/* Good zone (amber) */}
        <View
          style={[
            styles.zone,
            {
              left: cPx - GOOD_HALF,
              width: GOOD_HALF * 2,
              backgroundColor: `${colors.primary}40`,
            },
          ]}
        />

        {/* Excellent zone (gold) */}
        <View
          style={[
            styles.zone,
            {
              left: cPx - EXCEL_HALF,
              width: EXCEL_HALF * 2,
              backgroundColor: `${colors.accent}50`,
            },
          ]}
        />

        {/* Perfect zone (green) */}
        <View
          style={[
            styles.zone,
            {
              left: cPx - PERF_HALF,
              width: PERF_HALF * 2,
              backgroundColor: '#4CAF5070',
              borderRadius: 3,
            },
          ]}
        />

        {/* Zone border lines */}
        <View style={[styles.zoneLine, { left: cPx - EXCEL_HALF, backgroundColor: `${colors.accent}60` }]} />
        <View style={[styles.zoneLine, { left: cPx + EXCEL_HALF - 1, backgroundColor: `${colors.accent}60` }]} />

        {/* Needle */}
        <Animated.View style={[styles.needle, needleStyle]} />

        {/* Zone label */}
        <Text
          style={[
            styles.zoneLabel,
            {
              left: cPx - PERF_HALF,
              width: PERF_HALF * 2,
              color: '#4CAF50',
            },
          ]}
        >
          ✓
        </Text>
      </View>

      {/* Hit result flash */}
      <View style={styles.hitContainer}>
        <Animated.Text
          style={[
            styles.hitLabel,
            hitLabelStyle,
            { color: labelColor(lastHit, colors) },
          ]}
        >
          {lastHit ?? ''}
        </Animated.Text>
      </View>

      {/* Strike button */}
      <TouchableOpacity
        style={[
          styles.strikeButton,
          {
            backgroundColor:
              strikesCompleted >= TOTAL_STRIKES ? colors.muted : colors.primary,
          },
        ]}
        onPress={handleStrike}
        disabled={strikesCompleted >= TOTAL_STRIKES}
        activeOpacity={0.75}
      >
        <Text style={[styles.strikeButtonText, { color: colors.primaryForeground }]}>
          {strikesCompleted >= TOTAL_STRIKES ? 'Finition…' : '⚒  FRAPPER'}
        </Text>
      </TouchableOpacity>

      {/* Forge bonus hint */}
      <Text style={[styles.bonusHint, { color: colors.mutedForeground }]}>
        Bonus forge Niv.{forgeSkillLevel}: +{Math.min(40, forgeSkillLevel * 4)} pts qualité
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: PADDING,
    paddingTop: 14,
    paddingBottom: 10,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: { fontSize: 15, fontWeight: '800', letterSpacing: 2 },
  scoreText: { fontSize: 18, fontWeight: '800' },
  strikesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  strikeDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  strikeCount: { fontSize: 13, marginLeft: 4 },
  accuracyText: { fontSize: 12, fontWeight: '600', marginLeft: 'auto' },
  barContainer: {
    height: 52,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    alignSelf: 'center',
  },
  zone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  zoneLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
  },
  needle: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 1.5,
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  zoneLabel: {
    position: 'absolute',
    bottom: 3,
    fontSize: 10,
    textAlign: 'center',
    fontWeight: '800',
  },
  hitContainer: {
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 4,
  },
  hitLabel: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
  },
  strikeButton: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  strikeButtonText: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 2,
  },
  bonusHint: {
    fontSize: 11,
    textAlign: 'center',
  },
});
