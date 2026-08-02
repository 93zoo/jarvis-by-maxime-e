import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import type { Achievement } from '@/types/game';
import AudioManager from '@/utils/AudioManager';

interface Props {
  achievement: Achievement | null;
  onDismiss: () => void;
}

// ─── Category colours ─────────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  craft: '#E8A83A',
  economy: '#4CAF50',
  exploration: '#42A5F5',
  progression: '#AB47BC',
  special: '#EF5350',
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function AchievementToast({ achievement, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(-120);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);
  const prevIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!achievement) return;
    if (achievement.id === prevIdRef.current) return;
    prevIdRef.current = achievement.id;

    // Play achievement sound
    AudioManager.playAchievement();

    // Slide in
    translateY.value = withTiming(0, { duration: 380, easing: Easing.out(Easing.back(1.4)) });
    opacity.value = withTiming(1, { duration: 300 });
    scale.value = withSequence(
      withTiming(1.05, { duration: 200 }),
      withTiming(1, { duration: 150 }),
    );

    // Hold, then slide out
    translateY.value = withDelay(
      3200,
      withTiming(-140, { duration: 350, easing: Easing.in(Easing.cubic) }, (finished) => {
        if (finished) runOnJS(onDismiss)();
      }),
    );
    opacity.value = withDelay(3200, withTiming(0, { duration: 300 }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [achievement?.id]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { scale: scale.value }],
    opacity: opacity.value,
  }));

  if (!achievement) return null;

  const accentColor = CATEGORY_COLORS[achievement.category] ?? '#E8A83A';

  return (
    <Animated.View
      style={[styles.container, animStyle, { top: insets.top + 10 }]}
      pointerEvents="none"
    >
      {/* Left accent bar */}
      <View style={[styles.accentBar, { backgroundColor: accentColor }]} />

      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: accentColor + '22' }]}>
        <Feather name={achievement.icon as 'award'} size={22} color={accentColor} />
      </View>

      {/* Text */}
      <View style={styles.textWrap}>
        <Text style={styles.label}>Succès débloqué !</Text>
        <Text style={styles.title} numberOfLines={1}>{achievement.title}</Text>
        <Text style={styles.desc} numberOfLines={2}>{achievement.description}</Text>
      </View>

      {/* Stars decoration */}
      <View style={styles.starsWrap}>
        <MaterialCommunityIcons name="star-four-points" size={18} color={accentColor} />
      </View>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1128',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2E2040',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 999,
    paddingVertical: 12,
    paddingRight: 14,
  },
  accentBar: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: 2,
    marginLeft: 4,
    marginRight: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textWrap: {
    flex: 1,
    gap: 1,
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#8A7A9A',
    marginBottom: 2,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#F0E8FF',
  },
  desc: {
    fontSize: 11,
    color: '#7A6A8A',
    lineHeight: 15,
    marginTop: 2,
  },
  starsWrap: {
    paddingLeft: 6,
  },
  star: {
    fontSize: 18,
  },
});
