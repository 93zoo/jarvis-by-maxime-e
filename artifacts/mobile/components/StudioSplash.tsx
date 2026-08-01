/**
 * StudioSplash — cinématique d'intro épique pour Forge & Kingdoms.
 *
 * Séquence :
 *   Noir → forge qui embrase l'écran (braises + 4 couches de feu + shimmer de
 *   chaleur) → barres letterbox → "FORGE" s'écrase d'en haut (flash + gerbe
 *   d'étincelles) → "&" → "KINGDOMS" remonte d'en bas (flash + étincelles) →
 *   "FORGEZ VOTRE LÉGENDE" → métal qui refroidit (blanc → or) → fondu au noir.
 *
 * Toucher = passer.
 */
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

// ─── Palette ─────────────────────────────────────────────────────────────────
const BG        = '#060200';
const GOLD      = '#E8B84B';
const EMBER     = '#FF6A1F';
const EMBER2    = '#FF3D00';
const DEEP_RED  = '#6A1502';
const HOT_WHITE = '#FFF4E8';

// ─── Config ──────────────────────────────────────────────────────────────────
const N_EMBERS = 22;
const N_SPARKS = 22;

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components — defined BEFORE StudioSplash (Hermes hoisting rule)
// ─────────────────────────────────────────────────────────────────────────────

/** Gerbe d'étincelles projetée depuis un point central. */
function SparkBurst({
  progress,
  seed = 0,
}: {
  progress: Animated.Value;
  seed?: number;
}) {
  const dirs = useRef(
    Array.from({ length: N_SPARKS }, (_, i) => {
      const idx   = i + seed * N_SPARKS;
      const angle = Math.PI * (0.04 + (0.92 * i) / (N_SPARKS - 1));
      const dist  = 52 + ((idx * 43) % 85);
      const side  = idx % 2 === 0 ? 1 : -1;
      return {
        dx:    Math.cos(angle) * dist * side * (1 + (idx % 3) * 0.3),
        dy:   -Math.sin(angle) * dist - ((idx * 27) % 45),
        size:  2 + ((idx * 7) % 6),
        color: idx % 4 === 0 ? HOT_WHITE : idx % 3 === 0 ? GOLD : EMBER,
      };
    }),
  ).current;

  return (
    <>
      {dirs.map((d, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[
            styles.spark,
            {
              width:           d.size,
              height:          d.size,
              borderRadius:    d.size / 2,
              backgroundColor: d.color,
              opacity:         progress.interpolate({
                inputRange:  [0, 0.06, 0.65, 1],
                outputRange: [0, 1,    0.55, 0],
              }),
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange:  [0, 1],
                    outputRange: [0, d.dx],
                  }),
                },
                {
                  translateY: progress.interpolate({
                    inputRange:  [0, 1],
                    outputRange: [0, d.dy + 28],
                  }),
                },
                {
                  scale: progress.interpolate({
                    inputRange:  [0, 0.45, 1],
                    outputRange: [1.3, 0.8, 0.08],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </>
  );
}

/** 22 braises qui montent doucement depuis les flammes. */
function RisingEmbers() {
  const embers = useRef(
    Array.from({ length: N_EMBERS }, (_, i) => ({
      v:     new Animated.Value(0),
      x:     ((i * 79) % 100) / 100,
      size:  2 + (i % 4) * 1.5,
      dur:   2200 + ((i * 317) % 2200),
      delay: (i * 191) % 2000,
      color: i % 3 === 0 ? HOT_WHITE : i % 2 === 0 ? GOLD : EMBER,
    })),
  ).current;

  useEffect(() => {
    const loops = embers.map(({ v, dur, delay }) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, {
            toValue: 1,
            duration: dur,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {embers.map(({ v, x, size, color }, i) => (
        <Animated.View
          key={i}
          style={{
            position:     'absolute',
            bottom:       '13%',
            left:         `${4 + x * 92}%` as `${number}%`,
            width:        size,
            height:       size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: v.interpolate({
              inputRange:  [0, 0.1, 0.75, 1],
              outputRange: [0, 0.9, 0.45, 0],
            }),
            transform: [
              {
                translateY: v.interpolate({
                  inputRange:  [0, 1],
                  outputRange: [0, -400],
                }),
              },
              {
                translateX: v.interpolate({
                  inputRange:  [0, 0.5, 1],
                  outputRange: [0, i % 2 === 0 ? 18 : -18, 4],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
}

/** Quatre couches concentriques de lueur de forge. */
function FireGlow({ glow }: { glow: Animated.Value }) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {/* Sol : reflet large */}
      <Animated.View
        style={[
          styles.glowLayer,
          styles.glowGround,
          {
            opacity: glow.interpolate({
              inputRange:  [0, 1],
              outputRange: [0.12, 0.28],
            }),
          },
        ]}
      />
      {/* Halo ambiant extérieur */}
      <Animated.View
        style={[
          styles.glowLayer,
          styles.glowOuter,
          {
            opacity: glow.interpolate({
              inputRange:  [0, 1],
              outputRange: [0.2, 0.4],
            }),
          },
        ]}
      />
      {/* Couronne intermédiaire */}
      <Animated.View
        style={[
          styles.glowLayer,
          styles.glowMid,
          {
            opacity: glow.interpolate({
              inputRange:  [0, 1],
              outputRange: [0.35, 0.6],
            }),
          },
        ]}
      />
      {/* Noyau intense */}
      <Animated.View
        style={[
          styles.glowLayer,
          styles.glowCore,
          {
            opacity: glow.interpolate({
              inputRange:  [0, 1],
              outputRange: [0.55, 0.9],
            }),
          },
        ]}
      />
    </View>
  );
}

/** Voile de chaleur : légère teinte chaude oscillante simulant la distorsion. */
function HeatShimmer({ glow }: { glow: Animated.Value }) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: '#FF520010',
          opacity:          glow.interpolate({
            inputRange:  [0, 1],
            outputRange: [0.25, 0.65],
          }),
        },
      ]}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export default function StudioSplash({ onDone }: { onDone: () => void }) {
  const rootOpacity  = useRef(new Animated.Value(1)).current;
  const sceneOpacity = useRef(new Animated.Value(0)).current;
  const forgeGlow    = useRef(new Animated.Value(0.3)).current;
  const letterboxVal = useRef(new Animated.Value(0)).current;
  const forgeVal     = useRef(new Animated.Value(0)).current;
  const ampVal       = useRef(new Animated.Value(0)).current;
  const kingdomsVal  = useRef(new Animated.Value(0)).current;
  const subtitleVal  = useRef(new Animated.Value(0)).current;
  const cooled       = useRef(new Animated.Value(0)).current;
  const flash1       = useRef(new Animated.Value(0)).current;
  const flash2       = useRef(new Animated.Value(0)).current;
  const sparks1      = useRef(new Animated.Value(0)).current;
  const sparks2      = useRef(new Animated.Value(0)).current;
  const doneRef      = useRef(false);
  const timersRef    = useRef<ReturnType<typeof setTimeout>[]>([]);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    // ── Respiration des flammes ─────────────────────────────────────────────
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(forgeGlow, {
          toValue: 1,
          duration: 680,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(forgeGlow, {
          toValue: 0.3,
          duration: 680,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    glowLoop.start();

    // ── Impact 1 : flash + étincelles (FORGE) ──────────────────────────────
    const impact1 = Animated.parallel([
      Animated.sequence([
        Animated.timing(flash1, { toValue: 1, duration: 30, useNativeDriver: true }),
        Animated.timing(flash1, { toValue: 0, duration: 320, useNativeDriver: true }),
      ]),
      Animated.timing(sparks1, {
        toValue: 1,
        duration: 660,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    // ── Impact 2 : flash + étincelles (KINGDOMS) ───────────────────────────
    const impact2 = Animated.parallel([
      Animated.sequence([
        Animated.timing(flash2, { toValue: 1, duration: 30, useNativeDriver: true }),
        Animated.timing(flash2, { toValue: 0, duration: 320, useNativeDriver: true }),
      ]),
      Animated.timing(sparks2, {
        toValue: 1,
        duration: 660,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]);

    // ── Timeline principale ─────────────────────────────────────────────────
    Animated.sequence([
      Animated.timing(sceneOpacity, { toValue: 1, duration: 650, useNativeDriver: true }),
      Animated.delay(350),
      // Barres letterbox
      Animated.timing(letterboxVal, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // FORGE s'écrase d'en haut
      Animated.timing(forgeVal, {
        toValue: 1,
        duration: 230,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      impact1,
      Animated.delay(80),
      // &
      Animated.timing(ampVal, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(80),
      // KINGDOMS remonte d'en bas
      Animated.timing(kingdomsVal, {
        toValue: 1,
        duration: 230,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      impact2,
      Animated.delay(160),
      // Sous-titre
      Animated.timing(subtitleVal, { toValue: 1, duration: 620, useNativeDriver: true }),
      Animated.delay(800),
      // Métal qui refroidit (blanc → or)
      Animated.timing(cooled, {
        toValue: 1,
        duration: 850,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.delay(550),
      // Fondu au noir
      Animated.timing(rootOpacity, { toValue: 0, duration: 520, useNativeDriver: true }),
    ]).start(finish);

    // ── Vibrations calées sur les impacts ───────────────────────────────────
    if (Platform.OS !== 'web') {
      const h = (ms: number, fn: () => Promise<void>) => {
        timersRef.current.push(setTimeout(() => fn().catch(() => {}), ms));
      };
      // FORGE  ~1300ms
      h(1300, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
      // KINGDOMS ~2500ms
      h(2500, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
      // Titre complet ~3350ms
      h(3350, () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
    }

    return () => {
      glowLoop.stop();
      timersRef.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Dérivations d'animation ───────────────────────────────────────────────
  const topBarY = letterboxVal.interpolate({ inputRange: [0, 1], outputRange: [-82, 0] });
  const botBarY = letterboxVal.interpolate({ inputRange: [0, 1], outputRange: [82, 0] });

  const forgeY     = forgeVal.interpolate({ inputRange: [0, 1], outputRange: [-240, 0] });
  const forgeScale = forgeVal.interpolate({ inputRange: [0, 0.65, 1], outputRange: [1.7, 0.93, 1] });
  const forgeOp    = forgeVal.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0, 1, 1] });

  const kingY     = kingdomsVal.interpolate({ inputRange: [0, 1], outputRange: [240, 0] });
  const kingScale = kingdomsVal.interpolate({ inputRange: [0, 0.65, 1], outputRange: [1.7, 0.93, 1] });
  const kingOp    = kingdomsVal.interpolate({ inputRange: [0, 0.18, 1], outputRange: [0, 1, 1] });

  // Cross-fade blanc-chauffé → or-refroidi (jamais animer la couleur directement)
  const hotOp  = cooled.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const goldOp = cooled.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const ampScale = ampVal.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] });

  return (
    <Animated.View style={[styles.root, { opacity: rootOpacity }]} pointerEvents="auto">
      <Pressable style={StyleSheet.absoluteFill} onPress={finish}>

        <Animated.View style={[StyleSheet.absoluteFill, { opacity: sceneOpacity }]}>

          {/* ── Feu (4 couches) ── */}
          <FireGlow glow={forgeGlow} />

          {/* ── Distorsion de chaleur ── */}
          <HeatShimmer glow={forgeGlow} />

          {/* ── Braises qui montent ── */}
          <RisingEmbers />

          {/* ── Barres letterbox cinématiques ── */}
          <Animated.View
            pointerEvents="none"
            style={[styles.barTop, { transform: [{ translateY: topBarY }] }]}
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.barBot, { transform: [{ translateY: botBarY }] }]}
          />

          {/* ── "FORGE" — tombe d'en haut ── */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.wordRow,
              styles.forgeRow,
              { opacity: forgeOp, transform: [{ translateY: forgeY }, { scale: forgeScale }] },
            ]}
          >
            {/* couche blanche (métal chaud) */}
            <Animated.Text style={[styles.word, styles.wordLg, styles.hot, { opacity: hotOp }]}>
              FORGE
            </Animated.Text>
            {/* couche or (métal refroidi) — superposée */}
            <Animated.Text style={[styles.word, styles.wordLg, styles.golden, styles.overlay, { opacity: goldOp }]}>
              FORGE
            </Animated.Text>
          </Animated.View>

          {/* ── Étincelles impact FORGE ── */}
          <View style={styles.sparksTop} pointerEvents="none">
            <SparkBurst progress={sparks1} seed={0} />
          </View>

          {/* ── "&" ── */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.ampRow,
              { opacity: ampVal, transform: [{ scale: ampScale }] },
            ]}
          >
            <View style={styles.divLine} />
            <Text style={styles.ampText}>&</Text>
            <View style={styles.divLine} />
          </Animated.View>

          {/* ── "KINGDOMS" — monte d'en bas ── */}
          <Animated.View
            pointerEvents="none"
            style={[
              styles.wordRow,
              styles.kingdomsRow,
              { opacity: kingOp, transform: [{ translateY: kingY }, { scale: kingScale }] },
            ]}
          >
            <Animated.Text style={[styles.word, styles.wordSm, styles.hot, { opacity: hotOp }]}>
              KINGDOMS
            </Animated.Text>
            <Animated.Text style={[styles.word, styles.wordSm, styles.golden, styles.overlay, { opacity: goldOp }]}>
              KINGDOMS
            </Animated.Text>
          </Animated.View>

          {/* ── Étincelles impact KINGDOMS ── */}
          <View style={styles.sparksBot} pointerEvents="none">
            <SparkBurst progress={sparks2} seed={1} />
          </View>

          {/* ── Sous-titre ── */}
          <Animated.Text
            style={[styles.subtitle, { opacity: subtitleVal }]}
            pointerEvents="none"
          >
            FORGEZ VOTRE LÉGENDE
          </Animated.Text>

        </Animated.View>

        {/* ── Éclairs d'impact plein écran ── */}
        <Animated.View pointerEvents="none" style={[styles.flash, { opacity: flash1 }]} />
        <Animated.View pointerEvents="none" style={[styles.flash, { opacity: flash2 }]} />

        <Text style={styles.skipHint}>Toucher pour passer</Text>

      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    zIndex: 9999,
    elevation: 9999,
    overflow: 'hidden',
  },

  // ── Feu ──────────────────────────────────────────────────────────────────
  glowLayer: {
    position:     'absolute',
    alignSelf:    'center',
    borderRadius: 999,
  },
  glowGround: {
    bottom:          0,
    width:           600,
    height:          130,
    backgroundColor: EMBER2,
    transform:       [{ scaleY: 0.25 }],
  },
  glowOuter: {
    bottom:          '5%',
    width:           720,
    height:          340,
    backgroundColor: DEEP_RED,
    transform:       [{ scaleY: 0.38 }],
  },
  glowMid: {
    bottom:          '10%',
    width:           440,
    height:          290,
    backgroundColor: EMBER2,
    transform:       [{ scaleY: 0.48 }],
  },
  glowCore: {
    bottom:          '15%',
    width:           210,
    height:          210,
    backgroundColor: EMBER,
    transform:       [{ scaleY: 0.62 }],
  },

  // ── Letterbox ────────────────────────────────────────────────────────────
  barTop: {
    position:        'absolute',
    top:             0,
    left:            0,
    right:           0,
    height:          82,
    backgroundColor: '#000000',
  },
  barBot: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    height:          82,
    backgroundColor: '#000000',
  },

  // ── Titre ────────────────────────────────────────────────────────────────
  wordRow: {
    position:  'absolute',
    alignSelf: 'center',
  },
  forgeRow:    { top: '31%' },
  kingdomsRow: { top: '54%' },

  word: {
    fontWeight:       '900',
    letterSpacing:    10,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 28,
  },
  wordLg: { fontSize: 68 },
  wordSm: { fontSize: 46, letterSpacing: 6 },

  hot: {
    color:           HOT_WHITE,
    textShadowColor: '#FFA040',
  },
  golden: {
    color:           GOLD,
    textShadowColor: EMBER,
  },
  overlay: {
    position: 'absolute',
    top:      0,
    left:     0,
  },

  // ── "&" ──────────────────────────────────────────────────────────────────
  ampRow: {
    position:      'absolute',
    top:           '46.5%',
    alignSelf:     'center',
    flexDirection: 'row',
    alignItems:    'center',
    gap:           14,
  },
  divLine: {
    width:           58,
    height:          1.5,
    backgroundColor: 'rgba(232,184,75,0.4)',
  },
  ampText: {
    fontSize:         22,
    fontWeight:       '700',
    color:            GOLD,
    letterSpacing:    4,
    textShadowColor:  EMBER,
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },

  // ── Sous-titre ───────────────────────────────────────────────────────────
  subtitle: {
    position:         'absolute',
    bottom:           '20%',
    alignSelf:        'center',
    fontSize:         11,
    fontWeight:       '700',
    color:            'rgba(232,184,75,0.65)',
    letterSpacing:    6,
    textShadowColor:  EMBER,
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },

  // ── Étincelles ───────────────────────────────────────────────────────────
  sparksTop: {
    position:        'absolute',
    top:             '44%',
    alignSelf:       'center',
    alignItems:      'center',
    justifyContent:  'center',
  },
  sparksBot: {
    position:        'absolute',
    top:             '56%',
    alignSelf:       'center',
    alignItems:      'center',
    justifyContent:  'center',
  },
  spark: {
    position:        'absolute',
    shadowColor:     EMBER,
    shadowOpacity:   0.9,
    shadowRadius:    5,
    shadowOffset:    { width: 0, height: 0 },
    elevation:       3,
  },

  // ── Éclairs ──────────────────────────────────────────────────────────────
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFE4B0',
  },

  // ── Hint ─────────────────────────────────────────────────────────────────
  skipHint: {
    position:  'absolute',
    bottom:    26,
    alignSelf: 'center',
    color:     'rgba(240,228,200,0.26)',
    fontSize:  11,
    letterSpacing: 2,
  },
});
