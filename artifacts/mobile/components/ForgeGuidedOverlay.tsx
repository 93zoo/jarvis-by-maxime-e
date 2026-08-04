/**
 * ForgeGuidedOverlay — contextual hint bubble shown on the forge screen
 * for players who have completed the tutorial but haven't yet done their
 * first real forge.
 *
 * The overlay advances automatically as the craft phases change and calls
 * onDismiss once the RESULT is reached (or whenever the player taps ×).
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { STUDIO } from '@/constants/studio';
import type { CraftPhase } from '@/components/ForgeScene3D';

// ─── Guide data ───────────────────────────────────────────────────────────────

type GuidePhase = 'IDLE' | 'RECIPE_SHEET' | 'HEATING' | 'HAMMERING' | 'COOLING';

interface GuideConfig {
  icon: React.ComponentProps<typeof Feather>['name'];
  color: string;
  message: string;
  detail: string;
  showArrow: boolean;
}

const GUIDE: Record<GuidePhase, GuideConfig> = {
  IDLE: {
    icon: 'tool',
    color: STUDIO.gold,
    message: 'Appuie sur FORGER pour commencer',
    detail: 'Le bouton orange en bas de l\'écran',
    showArrow: true,
  },
  RECIPE_SHEET: {
    icon: 'book-open',
    color: '#7986CB',
    message: 'Choisis une recette de départ',
    detail: 'Elles sont gratuites — sélectionne celle que tu veux forger',
    showArrow: false,
  },
  HEATING: {
    icon: 'activity',
    color: '#F06A2B',
    message: 'Attends que la barre de chauffe soit pleine',
    detail: 'Le métal doit atteindre la bonne température',
    showArrow: false,
  },
  HAMMERING: {
    icon: 'tool',
    color: '#D8B765',
    message: 'Frappe quand l\'aiguille passe dans la zone lumineuse',
    detail: 'Vise le centre pour décrocher un PARFAIT !',
    showArrow: false,
  },
  COOLING: {
    icon: 'droplet',
    color: '#56B9DE',
    message: 'Appuie sur "SORTIR DU BAIN" dans la zone verte',
    detail: 'Ni trop tôt, ni trop tard pour une trempe parfaite',
    showArrow: false,
  },
};

// ─── Pulsed arrow — defined before parent component (Hermes rule) ─────────────

function PulsedArrow({ color }: { color: string }) {
  const opacity = useSharedValue(1);
  const translateY = useSharedValue(0);

  useEffect(() => {
    cancelAnimation(opacity);
    cancelAnimation(translateY);
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.25, { duration: 550, easing: Easing.inOut(Easing.ease) }),
        withTiming(1,    { duration: 550, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
    translateY.value = withRepeat(
      withSequence(
        withTiming(6,  { duration: 550, easing: Easing.inOut(Easing.ease) }),
        withTiming(0,  { duration: 550, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    );
  }, [opacity, translateY]);

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={style}>
      <Feather name="chevron-down" size={30} color={color} />
    </Animated.View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  craftPhase: CraftPhase;
  showRecipeSheet: boolean;
  onDismiss: () => void;
}

export default function ForgeGuidedOverlay({ craftPhase, showRecipeSheet, onDismiss }: Props) {
  const insets = useSafeAreaInsets();
  const [guidePhase, setGuidePhase] = useState<GuidePhase>('IDLE');
  const dismissedRef = useRef(false);

  // Advance guide phase automatically based on prop changes.
  useEffect(() => {
    if (dismissedRef.current) return;

    if (craftPhase === 'RESULT') {
      // First forge complete — trigger completion callback once.
      dismissedRef.current = true;
      onDismiss();
      return;
    }

    if (showRecipeSheet)            { setGuidePhase('RECIPE_SHEET'); return; }
    if (craftPhase === 'HEATING')   { setGuidePhase('HEATING');      return; }
    if (craftPhase === 'HAMMERING') { setGuidePhase('HAMMERING');    return; }
    if (craftPhase === 'COOLING')   { setGuidePhase('COOLING');      return; }
    if (craftPhase === 'IDLE')      { setGuidePhase('IDLE'); }
  }, [craftPhase, showRecipeSheet, onDismiss]);

  const config = GUIDE[guidePhase];

  const handleDismiss = () => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    onDismiss();
  };

  // Bottom offset: sit above the phase controls (bottom tab bar + controls height)
  const bottomOffset = insets.bottom + 88;

  return (
    <View
      style={[s.container, { bottom: bottomOffset }]}
      pointerEvents="box-none"
    >
      {config.showArrow && <PulsedArrow color={config.color} />}

      <View style={[s.bubble, { borderColor: config.color + '55' }]}>
        {/* Left color accent */}
        <View style={[s.accent, { backgroundColor: config.color }]} />

        {/* Icon */}
        <View style={s.iconWrap}>
          <Feather name={config.icon} size={22} color={config.color} />
        </View>

        {/* Text */}
        <View style={s.textBlock}>
          <Text style={s.message}>{config.message}</Text>
          <Text style={s.detail}>{config.detail}</Text>
        </View>

        {/* Dismiss */}
        <TouchableOpacity
          style={s.closeBtn}
          onPress={handleDismiss}
          hitSlop={12}
          accessibilityLabel="Ignorer le guide"
          accessibilityRole="button"
        >
          <Feather name="x" size={14} color="#756B5E" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 12,
    right: 12,
    alignItems: 'center',
  },
  bubble: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 14, 8, 0.94)',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 12,
  },
  accent: {
    width: 4,
    alignSelf: 'stretch',
  },
  iconWrap: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  textBlock: {
    flex: 1,
    paddingVertical: 12,
    paddingRight: 4,
    gap: 3,
  },
  message: {
    color: '#F5EFE2',
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
  },
  detail: {
    color: '#AFA492',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    alignSelf: 'flex-start',
  },
});
