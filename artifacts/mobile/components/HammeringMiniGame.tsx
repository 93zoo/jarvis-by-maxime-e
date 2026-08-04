import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import Animated, {
  type SharedValue,
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import AudioManager from '@/utils/AudioManager';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from '@/lib/LinearGradientSafe';

export type HitLabel = 'PARFAIT!' | 'EXCELLENT!' | 'TRÈS BIEN' | 'BIEN' | 'RATÉ';

export interface HammeringMiniGameProps {
  strikesCompleted: number;
  strikeScores: number[];
  onStrike: (score: number, label: HitLabel) => void;
  forgeSkillLevel: number;
}

const TOTAL_STRIKES = 5;

const PALETTE = {
  neonCyan: '#00E5FF',
  gold: '#E8B84B',
  ember: '#FF7A1A',
  charcoal: '#0D0A07',
  parchment: '#F5EFE2',
  steel: '#2A241F',
  darkRed: '#8B0000',
};

function scoreFromDeviation(dev: number): { score: number; label: HitLabel } {
  if (dev < 0.04) return { score: 25, label: 'PARFAIT!' };
  if (dev < 0.09) return { score: 20, label: 'EXCELLENT!' };
  if (dev < 0.16) return { score: 14, label: 'TRÈS BIEN' };
  if (dev < 0.24) return { score: 7, label: 'BIEN' };
  return { score: 0, label: 'RATÉ' };
}

function labelColor(label: HitLabel | null): string {
  if (!label) return PALETTE.parchment;
  switch (label) {
    case 'PARFAIT!': return PALETTE.neonCyan;
    case 'EXCELLENT!': return PALETTE.gold;
    case 'TRÈS BIEN': return PALETTE.ember;
    case 'BIEN': return '#E8862A';
    case 'RATÉ': return PALETTE.darkRed;
  }
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const Needle = ({ needleNorm, barWidth }: { needleNorm: SharedValue<number>; barWidth: number }) => {
  const needleStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: needleNorm.value * barWidth }],
  }));

  return (
    <Animated.View style={[styles.needleWrapper, needleStyle]}>
      <View style={styles.needleLine} />
      <View style={[styles.needleDiamond, { top: -2 }]} />
      <View style={[styles.needleDiamond, { bottom: -2 }]} />
    </Animated.View>
  );
};

const HitFlash = ({ flashOpacity }: { flashOpacity: SharedValue<number> }) => {
  const style = useAnimatedStyle(() => ({
    opacity: flashOpacity.value,
  }));
  return <Animated.View style={[StyleSheet.absoluteFillObject, { backgroundColor: '#FFF' }, style]} pointerEvents="none" />;
};

const GaugeBorder = ({ children, overlay }: { children: React.ReactNode; overlay: React.ReactNode }) => (
  <View style={styles.gaugeBorderContainer}>
    <LinearGradient colors={['#3E342B', '#1A1410']} style={styles.gaugeOuterBorder}>
      {children}
      <View style={[StyleSheet.absoluteFillObject, { padding: 2 }]} pointerEvents="none">
        {overlay}
      </View>
    </LinearGradient>
    <View style={[styles.bolt, { top: 4, left: 4 }]} />
    <View style={[styles.bolt, { top: 4, right: 4 }]} />
    <View style={[styles.bolt, { bottom: 4, left: 4 }]} />
    <View style={[styles.bolt, { bottom: 4, right: 4 }]} />
  </View>
);

const Gauge = ({
  barWidth,
  perfectCenter,
  needleNorm,
  flashOpacity,
}: {
  barWidth: number;
  perfectCenter: number;
  needleNorm: SharedValue<number>;
  flashOpacity: SharedValue<number>;
}) => {
  const cPx = perfectCenter * barWidth;
  const PERF_HALF = barWidth * 0.04;
  const EXCEL_HALF = barWidth * 0.09;
  const TB_HALF = barWidth * 0.16;
  const BIEN_HALF = barWidth * 0.24;

  return (
    <GaugeBorder overlay={<Needle needleNorm={needleNorm} barWidth={barWidth} />}>
      <View style={[styles.gaugeInnerRim, { width: barWidth }]}>
        <View style={styles.gaugeBackground} />
        <View style={[styles.zone, styles.zoneBien, { left: cPx - BIEN_HALF, width: BIEN_HALF * 2 }]} />
        <View style={[styles.zone, styles.zoneTresBien, { left: cPx - TB_HALF, width: TB_HALF * 2 }]} />
        <View style={[styles.zone, styles.zoneExcellent, { left: cPx - EXCEL_HALF, width: EXCEL_HALF * 2 }]} />
        <View style={[styles.zone, styles.zonePerfect, { left: cPx - PERF_HALF, width: PERF_HALF * 2 }]}>
          <View style={styles.zonePerfectCore} />
        </View>
        <HitFlash flashOpacity={flashOpacity} />
      </View>
    </GaugeBorder>
  );
};

export default function HammeringMiniGame({
  strikesCompleted,
  strikeScores,
  onStrike,
  forgeSkillLevel,
}: HammeringMiniGameProps) {
  const colors = useColors();
  const { width: screenWidth } = useWindowDimensions();
  
  const PADDING = 20;
  const GAUGE_CHROME = 18; 
  const barWidth = screenWidth - PADDING * 2 - GAUGE_CHROME;

  const [perfectCenter] = useState(() => 0.22 + Math.random() * 0.56);
  const needleNorm = useSharedValue(0);

  const [lastHit, setLastHit] = useState<HitLabel | null>(null);
  const hitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const baseDuration = Math.max(650, 1180 - strikesCompleted * 110);
    // Cancel the current animation without snapping to 0, then restart from
    // the current needle position — avoids the visual jump on every strike.
    cancelAnimation(needleNorm);
    needleNorm.value = withRepeat(
      withSequence(
        withTiming(1, { duration: baseDuration, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: baseDuration, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [strikesCompleted]); // eslint-disable-line react-hooks/exhaustive-deps

  const hitOpacity = useSharedValue(0);
  const hitScale = useSharedValue(0.5);
  const hitTranslateY = useSharedValue(0);
  const flashOpacity = useSharedValue(0);
  const shakeX = useSharedValue(0);
  const buttonScale = useSharedValue(1);

  const hitLabelStyle = useAnimatedStyle(() => ({
    opacity: hitOpacity.value,
    transform: [
      { scale: hitScale.value },
      { translateY: hitTranslateY.value }
    ],
  }));

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: buttonScale.value }],
  }));

  const flashHit = (label: HitLabel) => {
    hitOpacity.value = 1;
    hitScale.value = 0.6;
    hitTranslateY.value = 8;
    
    hitScale.value = withTiming(1.1, { duration: 400, easing: Easing.out(Easing.back(1.5)) });
    hitTranslateY.value = withTiming(-16, { duration: 800, easing: Easing.out(Easing.quad) });
    
    hitOpacity.value = withSequence(
      withTiming(1, { duration: 500 }),
      withTiming(0, { duration: 300, easing: Easing.in(Easing.quad) })
    );
  };

  const handleStrike = () => {
    if (strikesCompleted >= TOTAL_STRIKES) return;
    const pos = needleNorm.value; 
    const deviation = Math.abs(pos - perfectCenter);
    const { score, label } = scoreFromDeviation(deviation);

    Haptics.impactAsync(
      score >= 20
        ? Haptics.ImpactFeedbackStyle.Heavy
        : score >= 7
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    );

    if (score >= 20) {
      AudioManager.playPerfectStrike();
    } else {
      AudioManager.playHammerStrike();
    }

    shakeX.value = withSequence(
      withTiming(score >= 20 ? -8 : -4, { duration: 40 }),
      withTiming(score >= 20 ? 8 : 4, { duration: 40 }),
      withTiming(score >= 20 ? -4 : -2, { duration: 40 }),
      withTiming(score >= 20 ? 4 : 2, { duration: 40 }),
      withTiming(0, { duration: 40 })
    );

    flashOpacity.value = 1;
    flashOpacity.value = withTiming(0, { duration: 600, easing: Easing.out(Easing.quad) });

    setLastHit(label);
    flashHit(label);

    if (hitTimerRef.current) clearTimeout(hitTimerRef.current);
    hitTimerRef.current = setTimeout(() => setLastHit(null), 900);

    onStrike(score, label);
  };

  const handlePressIn = () => {
    if (strikesCompleted >= TOTAL_STRIKES) return;
    buttonScale.value = withTiming(0.94, { duration: 80, easing: Easing.out(Easing.quad) });
  };

  const handlePressOut = () => {
    if (strikesCompleted >= TOTAL_STRIKES) return;
    buttonScale.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.back(1.5)) });
    handleStrike();
  };

  const totalScore = strikeScores.reduce((a, b) => a + b, 0);
  const maxPossible = strikesCompleted * 25;
  const accuracy = maxPossible > 0 ? Math.round((totalScore / maxPossible) * 100) : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.card, paddingHorizontal: PADDING }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Feather name="tool" size={22} color={PALETTE.gold} />
          <Text style={styles.headerTitle}>MARTELAGE</Text>
        </View>
        <View style={styles.scoreBadge}>
          <Feather name="star" size={16} color={PALETTE.neonCyan} />
          <Text style={styles.scoreText}>{totalScore} <Text style={styles.scorePts}>pts</Text></Text>
        </View>
      </View>

      {/* Progress */}
      <View style={styles.progressRow}>
        <View style={styles.ingotsContainer}>
          {Array.from({ length: TOTAL_STRIKES }).map((_, i) => {
            const done = i < strikesCompleted;
            const score = done ? strikeScores[i] : 0;
            let bgColor = PALETTE.steel;
            let glow = 0;
            if (done) {
              if (score >= 20) { bgColor = PALETTE.neonCyan; glow = 1; }
              else if (score >= 14) { bgColor = PALETTE.gold; glow = 0.5; }
              else if (score >= 7) { bgColor = PALETTE.ember; glow = 0.5; }
              else { bgColor = PALETTE.darkRed; }
            }
            return (
              <View key={i} style={[styles.ingotWrapper, glow ? { shadowColor: bgColor, shadowOpacity: 0.8, shadowRadius: 6, elevation: 4 } : null]}>
                <View style={[styles.ingot, { backgroundColor: bgColor }]} />
              </View>
            );
          })}
        </View>
        <Text style={styles.accuracyText}>{strikesCompleted > 0 ? `${accuracy}% PRÉCISION` : 'PRÊT'}</Text>
      </View>

      {/* Gauge */}
      <Animated.View style={[styles.gaugeOuterWrapper, containerStyle]}>
        <Gauge barWidth={barWidth} perfectCenter={perfectCenter} needleNorm={needleNorm} flashOpacity={flashOpacity} />
      </Animated.View>

      {/* Hit Result Flash */}
      <View style={styles.hitContainer}>
        <Animated.Text
          style={[
            styles.hitLabel,
            hitLabelStyle,
            { color: labelColor(lastHit) },
          ]}
        >
          {lastHit ?? ''}
        </Animated.Text>
      </View>

      {/* Strike Button */}
      <AnimatedPressable
        style={[
          styles.strikeButton,
          buttonAnimatedStyle,
          strikesCompleted >= TOTAL_STRIKES && styles.strikeButtonDisabled
        ]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={strikesCompleted >= TOTAL_STRIKES}
      >
        <LinearGradient
          colors={strikesCompleted >= TOTAL_STRIKES ? ['#3E342B', '#1A1410'] : [PALETTE.ember, '#A33E00']}
          style={[styles.strikeButtonGradient, strikesCompleted >= TOTAL_STRIKES && styles.strikeButtonGradientDisabled]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        >
          <Feather 
            name={strikesCompleted >= TOTAL_STRIKES ? "check" : "tool"} 
            size={28} 
            color={strikesCompleted >= TOTAL_STRIKES ? "#888" : "#FFF"} 
          />
          <Text style={[styles.strikeButtonText, strikesCompleted >= TOTAL_STRIKES && { color: '#888', textShadowColor: 'transparent' }]}>
            {strikesCompleted >= TOTAL_STRIKES ? 'FINITION…' : 'FRAPPER'}
          </Text>
        </LinearGradient>
      </AnimatedPressable>

      {/* Bonus hint */}
      <Text style={styles.bonusHint}>
        Bonus forge Niv.{forgeSkillLevel}: +{Math.min(40, forgeSkillLevel * 4)} pts qualité
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: 16,
    paddingBottom: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: PALETTE.parchment,
    letterSpacing: 2,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 229, 255, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.3)',
    gap: 6,
  },
  scoreText: {
    fontSize: 18,
    fontWeight: '900',
    color: PALETTE.neonCyan,
  },
  scorePts: {
    fontSize: 12,
    fontWeight: '700',
    color: PALETTE.neonCyan,
    opacity: 0.8,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  ingotsContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  ingotWrapper: {},
  ingot: {
    width: 14,
    height: 20,
    borderRadius: 3,
    transform: [{ skewX: '-10deg' }],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  accuracyText: {
    fontSize: 13,
    fontWeight: '800',
    color: PALETTE.gold,
    letterSpacing: 1,
  },
  gaugeOuterWrapper: {
    alignSelf: 'center',
  },
  gaugeBorderContainer: {
    padding: 6,
    backgroundColor: '#1E1915',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#3E342B',
    shadowColor: '#000',
    shadowOpacity: 0.8,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  gaugeOuterBorder: {
    padding: 2,
    borderRadius: 4,
    position: 'relative',
  },
  gaugeInnerRim: {
    backgroundColor: PALETTE.charcoal,
    borderRadius: 2,
    overflow: 'hidden',
    height: 44,
    position: 'relative',
  },
  gaugeBackground: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#110D0A',
  },
  bolt: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0A0806',
    borderWidth: 1,
    borderColor: '#4A3E33',
  },
  zone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
  },
  zoneBien: {
    backgroundColor: 'rgba(232, 134, 42, 0.2)',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(232, 134, 42, 0.4)',
  },
  zoneTresBien: {
    backgroundColor: 'rgba(255, 122, 26, 0.4)',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(255, 122, 26, 0.6)',
  },
  zoneExcellent: {
    backgroundColor: 'rgba(232, 184, 75, 0.6)',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(232, 184, 75, 0.8)',
  },
  zonePerfect: {
    backgroundColor: 'rgba(0, 229, 255, 0.3)',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: PALETTE.neonCyan,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PALETTE.neonCyan,
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  zonePerfectCore: {
    width: 2,
    height: '100%',
    backgroundColor: '#FFF',
    shadowColor: PALETTE.neonCyan,
    shadowOpacity: 1,
    shadowRadius: 4,
  },
  needleWrapper: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    left: 0,
    width: 2,
    overflow: 'visible', // iOS clips width:0 children by default; explicit visible fixes the needle
    zIndex: 10,
  },
  needleLine: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: 2,
    left: -1,
    backgroundColor: '#FFF',
    shadowColor: PALETTE.neonCyan,
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 3,
  },
  needleDiamond: {
    position: 'absolute',
    left: -6,
    width: 12,
    height: 12,
    backgroundColor: '#FFF',
    transform: [{ rotate: '45deg' }],
    shadowColor: PALETTE.neonCyan,
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  hitContainer: {
    height: 50,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 4,
    zIndex: 20,
  },
  hitLabel: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 3,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  strikeButton: {
    width: '100%',
    height: 60,
    borderRadius: 12,
    shadowColor: PALETTE.ember,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  strikeButtonDisabled: {
    shadowOpacity: 0,
    elevation: 2,
  },
  strikeButtonGradient: {
    flex: 1,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FFB770',
    gap: 12,
  },
  strikeButtonGradientDisabled: {
    borderColor: '#4A3E33',
  },
  strikeButtonText: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 4,
    color: '#FFF',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  bonusHint: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 12,
    fontWeight: '600',
    color: PALETTE.parchment,
    opacity: 0.6,
  },
});
