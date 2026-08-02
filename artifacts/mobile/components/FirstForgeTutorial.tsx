/**
 * FirstForgeTutorial — courte découverte de la boucle de forge.
 *
 * Rendu en overlay, après l'introduction du studio. Le statut final est
 * persisté par GameContext avant que l'overlay ne soit démonté.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { STUDIO } from '@/constants/studio';

type ForgeIcon = React.ComponentProps<typeof MaterialCommunityIcons>['name'];

interface TutorialStep {
  eyebrow: string;
  title: string;
  description: string;
  detail: string;
  icon: ForgeIcon;
  color: string;
  actionLabel: string;
  /** Optional custom illustration — replaces the default TutorialIllustration. */
  renderIllustration?: () => React.ReactNode;
}

const STEPS: TutorialStep[] = [
  {
    eyebrow: 'NAVIGATION',
    title: 'Les onglets',
    description: "Six onglets au bas de l'écran pour tout explorer.",
    detail: "Tu peux naviguer librement à tout moment.",
    icon: 'view-grid',
    color: '#7986CB',
    actionLabel: 'SUIVANT',
    renderIllustration: () => <TabsGrid />,
  },
  {
    eyebrow: 'BARRE LATÉRALE',
    title: 'Les outils du forgeron',
    description: "Quatre boutons à gauche de la forge pour gérer ton atelier.",
    detail: "Quêtes, Événements, Apprenti et Améliorations.",
    icon: 'tools',
    color: '#FFB74D',
    actionLabel: 'SUIVANT',
    renderIllustration: () => <SidebarGrid />,
  },
  {
    eyebrow: 'CODEX · RECETTES',
    title: 'Trouver une recette',
    description: "Toutes les recettes se trouvent dans le Codex, onglet Recettes.",
    detail: "Les recettes de départ sont gratuites ; les autres se débloquent avec de l'or.",
    icon: 'book-open-variant',
    color: STUDIO.gold,
    actionLabel: 'SUIVANT',
    renderIllustration: () => <RecipeIllustration />,
  },
  {
    eyebrow: 'PREMIÈRE FORGE',
    title: 'Choisis une recette',
    description: 'Touche FORGER et sélectionne l’objet que tu veux créer.',
    detail: 'Les matériaux requis sont indiqués avant de commencer.',
    icon: 'anvil',
    color: STUDIO.gold,
    actionLabel: 'CHOISIR',
  },
  {
    eyebrow: 'ÉTAPE 2 · LA CHALEUR',
    title: 'Chauffe le métal',
    description: 'Le four porte la pièce à bonne température avant le travail.',
    detail: 'Laisse la barre de chauffe se remplir : le métal doit briller.',
    icon: 'fire',
    color: '#F06A2B',
    actionLabel: 'CHAUFFER',
  },
  {
    eyebrow: 'ÉTAPE 3 · LE GESTE',
    title: 'Frappe au bon moment',
    description: 'Frappe quand l’aiguille passe dans la zone lumineuse.',
    detail: 'Une frappe précise améliore la qualité de ton œuvre.',
    icon: 'hammer',
    color: '#D8B765',
    actionLabel: 'FRAPPER',
  },
  {
    eyebrow: 'ÉTAPE 4 · LA TREMPE',
    title: 'Refroidis la pièce',
    description: 'Retire l’acier dans la zone verte pour réussir la trempe.',
    detail: 'Trouve l’équilibre entre un métal trop chaud et trop froid.',
    icon: 'water',
    color: '#56B9DE',
    actionLabel: 'REFROIDIR',
  },
  {
    eyebrow: 'ÉTAPE 5 · LA RÉCOMPENSE',
    title: 'Livre une commande',
    description: 'Consulte les commandes et remets l’objet au client satisfait.',
    detail: 'Tu gagnes de l’or, de l’expérience et de la réputation.',
    icon: 'package-variant-closed',
    color: '#72BC75',
    actionLabel: 'COMMENCER',
  },
];

const EMBERS: Array<{
  left: `${number}%`;
  bottom: `${number}%`;
  size: number;
  delay: number;
  duration: number;
}> = [
  { left: '8%', bottom: '16%', size: 4, delay: 0, duration: 1900 },
  { left: '18%', bottom: '8%', size: 6, delay: 330, duration: 2400 },
  { left: '79%', bottom: '12%', size: 5, delay: 170, duration: 2050 },
  { left: '88%', bottom: '27%', size: 3, delay: 680, duration: 1800 },
  { left: '67%', bottom: '5%', size: 4, delay: 440, duration: 2200 },
];

// Defined before the main component to remain safe with Hermes hook hoisting.
function RisingEmber({
  left,
  bottom,
  size,
  delay,
  duration,
}: {
  left: `${number}%`;
  bottom: `${number}%`;
  size: number;
  delay: number;
  duration: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(progress, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [delay, duration, progress]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ember,
        {
          left,
          bottom,
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: progress.interpolate({ inputRange: [0, 0.18, 0.86, 1], outputRange: [0, 0.8, 0.55, 0] }),
          transform: [
            { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, -150] }) },
            { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, size % 2 === 0 ? 16 : -12] }) },
            { scale: progress.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0.55, 1, 0.55] }) },
          ],
        },
      ]}
    />
  );
}

function TutorialIllustration({ step }: { step: TutorialStep }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.15] });
  const haloOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.52] });
  const iconScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });

  return (
    <View style={styles.illustration} pointerEvents="none">
      <Animated.View
        style={[
          styles.iconOuterHalo,
          { borderColor: step.color, opacity: haloOpacity, transform: [{ scale: haloScale }] },
        ]}
      />
      <View style={[styles.iconPlate, { borderColor: step.color }]}>
        <Animated.View style={{ transform: [{ scale: iconScale }] }}>
          <MaterialCommunityIcons name={step.icon} size={62} color={step.color} />
        </Animated.View>
      </View>
      <View style={[styles.iconSpark, styles.iconSparkTop, { backgroundColor: step.color }]} />
      <View style={[styles.iconSpark, styles.iconSparkRight, { backgroundColor: step.color }]} />
      <View style={[styles.iconSpark, styles.iconSparkBottom, { backgroundColor: step.color }]} />
    </View>
  );
}

// ─── Orientation-slide illustrations ─────────────────────────────────────────
// Pure render functions (no hooks) — safe to define anywhere in module scope.

const mgStyles = StyleSheet.create({
  grid:            { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 6 },
  item:            { width: '47%', flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: 'rgba(245,239,226,0.05)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(245,239,226,0.09)', padding: 8 },
  iconBox:         { width: 30, height: 30, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  label:           { color: '#F5EFE2', fontSize: 11, fontWeight: '800' },
  role:            { color: '#AFA492', fontSize: 9, fontWeight: '600' },
  recipeContainer: { width: '100%', marginVertical: 6 },
  navRow:          { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  navChip:         { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  navChipText:     { fontSize: 11, fontWeight: '700' },
  recipeCard:      { backgroundColor: 'rgba(245,239,226,0.05)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(245,239,226,0.1)', padding: 10 },
  recipeRow:       { flexDirection: 'row', alignItems: 'center', gap: 8 },
  recipeName:      { color: '#F5EFE2', fontSize: 12, fontWeight: '700' },
  recipeMeta:      { color: '#AFA492', fontSize: 10, fontWeight: '600' },
  badge:           { flexDirection: 'row', alignItems: 'center', borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 3 },
  badgeText:       { fontSize: 9, fontWeight: '800' },
});

function MenuGridItem({ icon, label, role, color, useFeather }: {
  icon: string; label: string; role: string; color: string; useFeather?: boolean;
}) {
  return (
    <View style={mgStyles.item}>
      <View style={[mgStyles.iconBox, { backgroundColor: color + '22', borderColor: color + '55' }]}>
        {useFeather
          ? <Feather name={icon as any} size={16} color={color} />
          : <MaterialCommunityIcons name={icon as any} size={16} color={color} />
        }
      </View>
      <View style={{ flex: 1 }}>
        <Text style={mgStyles.label}>{label}</Text>
        <Text style={mgStyles.role}>{role}</Text>
      </View>
    </View>
  );
}

const TABS_DATA = [
  { icon: 'hammer',            label: 'Forge',      role: 'Forger',      color: STUDIO.gold, feather: false },
  { icon: 'map-marker-radius', label: 'Monde',      role: 'Explorer',    color: '#72BC75',   feather: false },
  { icon: 'package-variant',   label: 'Inventaire', role: 'Ressources',  color: '#56B9DE',   feather: false },
  { icon: 'layers',            label: 'Sets',       role: 'Collections', color: '#CE93D8',   feather: true  },
  { icon: 'book-open',         label: 'Codex',      role: 'Recettes',    color: '#FFB74D',   feather: true  },
  { icon: 'star',              label: 'Compét.',    role: 'Talents',     color: '#F06A2B',   feather: true  },
] as const;

function TabsGrid() {
  return (
    <View style={mgStyles.grid}>
      {TABS_DATA.map((t) => (
        <MenuGridItem key={t.label} icon={t.icon} label={t.label} role={t.role} color={t.color} useFeather={t.feather} />
      ))}
    </View>
  );
}

const TOOLS_DATA = [
  { icon: 'book-open',   label: 'Quêtes',     role: 'Missions actives', color: '#72BC75'   },
  { icon: 'zap',         label: 'Événements', role: 'Bonus de forge',   color: '#FFB74D'   },
  { icon: 'user',        label: 'Apprenti',   role: 'Aide forgeron',    color: '#56B9DE'   },
  { icon: 'trending-up', label: 'Améliorer',  role: 'Upgrades',         color: STUDIO.gold },
] as const;

function SidebarGrid() {
  return (
    <View style={mgStyles.grid}>
      {TOOLS_DATA.map((t) => (
        <MenuGridItem key={t.label} icon={t.icon} label={t.label} role={t.role} color={t.color} useFeather />
      ))}
    </View>
  );
}

function RecipeIllustration() {
  return (
    <View style={mgStyles.recipeContainer}>
      <View style={mgStyles.navRow}>
        <View style={[mgStyles.navChip, { backgroundColor: STUDIO.gold + '18', borderColor: STUDIO.gold + '40' }]}>
          <Feather name="book-open" size={11} color={STUDIO.gold} />
          <Text style={[mgStyles.navChipText, { color: STUDIO.gold }]}>Codex</Text>
        </View>
        <MaterialCommunityIcons name="chevron-right" size={14} color="#756B5E" />
        <View style={[mgStyles.navChip, { backgroundColor: STUDIO.gold + '18', borderColor: STUDIO.gold + '40' }]}>
          <MaterialCommunityIcons name="clipboard-list" size={11} color={STUDIO.gold} />
          <Text style={[mgStyles.navChipText, { color: STUDIO.gold }]}>Recettes</Text>
        </View>
      </View>
      <View style={mgStyles.recipeCard}>
        <View style={mgStyles.recipeRow}>
          <MaterialCommunityIcons name="hammer" size={18} color={STUDIO.gold} />
          <View style={{ flex: 1 }}>
            <Text style={mgStyles.recipeName}>Épée en Fer</Text>
            <Text style={mgStyles.recipeMeta}>Niveau Forge 1</Text>
          </View>
          <View style={[mgStyles.badge, { backgroundColor: '#72BC7522', borderColor: '#72BC7555' }]}>
            <Text style={[mgStyles.badgeText, { color: '#72BC75' }]}>GRATUITE</Text>
          </View>
        </View>
        <View style={[mgStyles.recipeRow, { marginTop: 8, opacity: 0.65 }]}>
          <MaterialCommunityIcons name="lock" size={16} color="#FFB74D" />
          <View style={{ flex: 1 }}>
            <Text style={mgStyles.recipeName}>Épée en Acier</Text>
            <Text style={mgStyles.recipeMeta}>Niveau Forge 5</Text>
          </View>
          <View style={[mgStyles.badge, { backgroundColor: '#FFB74D22', borderColor: '#FFB74D55' }]}>
            <Text style={[mgStyles.badgeText, { color: '#FFB74D' }]}>À DÉBLOQUER</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function FirstForgeTutorial({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const [stepIndex, setStepIndex] = useState(0);
  const transition = useRef(new Animated.Value(1)).current;
  const isFinishingRef = useRef(false);
  const step = STEPS[stepIndex];
  const isLastStep = stepIndex === STEPS.length - 1;

  const finish = () => {
    if (isFinishingRef.current) return;
    isFinishingRef.current = true;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onDone();
  };

  const advance = () => {
    if (isLastStep) {
      finish();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    Animated.sequence([
      Animated.timing(transition, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.timing(transition, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
    setStepIndex((current) => Math.min(current + 1, STEPS.length - 1));
  };

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={finish}>
      <View style={[styles.backdrop, { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 67 : 18), paddingBottom: Math.max(insets.bottom, Platform.OS === 'web' ? 34 : 18) }]}>
        {EMBERS.map((ember, index) => <RisingEmber key={index} {...ember} />)}

        <View style={styles.topRow}>
          <View style={styles.stepCount}>
            <Text style={styles.stepCountText}>{stepIndex + 1} / {STEPS.length}</Text>
          </View>
          <TouchableOpacity
            accessibilityLabel="Fermer le tutoriel"
            accessibilityRole="button"
            testID="first-forge-tutorial-close"
            style={styles.closeButton}
            onPress={finish}
            hitSlop={10}
          >
            <Feather name="x" size={22} color={STUDIO.parchment} />
          </TouchableOpacity>
        </View>

        <Animated.View
          style={[
            styles.card,
            {
              opacity: transition,
              transform: [{ translateY: transition.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
            },
          ]}
        >
          <Text style={[styles.eyebrow, { color: step.color }]}>{step.eyebrow}</Text>
          {step.renderIllustration ? step.renderIllustration() : <TutorialIllustration step={step} />}
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.description}>{step.description}</Text>
          <View style={styles.detailRow}>
            <Feather name="check" size={15} color={step.color} />
            <Text style={styles.detail}>{step.detail}</Text>
          </View>
        </Animated.View>

        <View style={styles.footer}>
          <View style={styles.progress} accessibilityLabel={`Étape ${stepIndex + 1} sur ${STEPS.length}`}>
            {STEPS.map((entry, index) => (
              <View
                key={entry.title}
                style={[
                  styles.progressDot,
                  index <= stepIndex && { backgroundColor: step.color, borderColor: step.color },
                  index === stepIndex && styles.progressDotCurrent,
                ]}
              />
            ))}
          </View>

          <TouchableOpacity
            accessibilityRole="button"
            testID="first-forge-tutorial-next"
            style={[styles.primaryButton, { backgroundColor: step.color }]}
            onPress={advance}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>{isLastStep ? 'ENTRER DANS LA FORGE' : 'SUIVANT'}</Text>
            <Feather name={isLastStep ? 'arrow-right' : 'chevron-right'} size={20} color={STUDIO.coal} />
          </TouchableOpacity>

          {!isLastStep && (
            <Pressable
              accessibilityRole="button"
              testID="first-forge-tutorial-skip"
              onPress={finish}
              hitSlop={10}
            >
              <Text style={styles.skipText}>Passer le tutoriel</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 22,
    backgroundColor: 'rgba(10, 8, 16, 0.96)',
  },
  ember: {
    position: 'absolute',
    backgroundColor: '#FF7A2D',
    shadowColor: '#FF9C44',
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 5,
  },
  topRow: {
    minHeight: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stepCount: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 239, 226, 0.09)',
    borderWidth: 1,
    borderColor: 'rgba(245, 239, 226, 0.16)',
  },
  stepCountText: {
    color: STUDIO.parchment,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  closeButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 239, 226, 0.09)',
    borderWidth: 1,
    borderColor: 'rgba(245, 239, 226, 0.16)',
  },
  card: {
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 25,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(232, 184, 75, 0.38)',
    backgroundColor: 'rgba(23, 18, 8, 0.96)',
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  eyebrow: {
    marginBottom: 8,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.2,
    textAlign: 'center',
  },
  illustration: {
    width: 146,
    height: 146,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 5,
  },
  iconOuterHalo: {
    position: 'absolute',
    width: 118,
    height: 118,
    borderRadius: 59,
    borderWidth: 1.5,
  },
  iconPlate: {
    width: 94,
    height: 94,
    borderRadius: 47,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    backgroundColor: 'rgba(8, 6, 5, 0.84)',
    shadowColor: STUDIO.gold,
    shadowOpacity: 0.35,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
  iconSpark: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  iconSparkTop: { top: 20, left: 32 },
  iconSparkRight: { top: 43, right: 21 },
  iconSparkBottom: { bottom: 23, left: 40, width: 3, height: 3 },
  title: {
    marginTop: 4,
    color: STUDIO.parchment,
    fontSize: 26,
    lineHeight: 31,
    fontWeight: '900',
    textAlign: 'center',
  },
  description: {
    marginTop: 12,
    color: '#D8CFBE',
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500',
    textAlign: 'center',
  },
  detailRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 18,
    paddingTop: 15,
    borderTopWidth: 1,
    borderTopColor: 'rgba(245, 239, 226, 0.12)',
  },
  detail: {
    flex: 1,
    color: '#AFA492',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
  },
  footer: {
    alignItems: 'center',
    gap: 15,
  },
  progress: {
    height: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#756B5E',
    backgroundColor: 'rgba(245, 239, 226, 0.18)',
  },
  progressDotCurrent: {
    width: 24,
    borderRadius: 5,
  },
  primaryButton: {
    width: '100%',
    minHeight: 56,
    paddingHorizontal: 22,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  primaryButtonText: {
    color: STUDIO.coal,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  skipText: {
    color: '#AAA08F',
    fontSize: 13,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});