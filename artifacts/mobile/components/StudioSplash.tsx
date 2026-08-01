/**
 * StudioSplash — intro « studio de musique futuriste » au lancement.
 *
 * Séquence : noir → une grille rétro-futuriste s'illumine en perspective →
 * un égaliseur géant danse au rythme de basses (pulsations + vibrations) →
 * un faisceau lumineux balaie la scène → les lettres MAXIME-E tombent une à
 * une en néon double-halo (cyan/magenta), « prod. » s'allume en grésillant →
 * pulsation finale sur le beat → fondu vers le jeu. Toucher = passer.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

const BG = '#04040A';
const NEON = '#00E5FF';
const MAGENTA = '#FF2D95';
const VIOLET = '#6C2BD9';
const GRID = 'rgba(0,229,255,0.16)';

const LETTERS = 'MAXIME-E'.split('');
const EQ_BARS = 14;
const BEAT_TIMES = [700, 1300, 1900, 2500, 3600]; // pulsations (ms), la dernière = drop final

/** Barres d'égaliseur qui dansent (boucles décalées, hauteurs pseudo-aléatoires). */
function Equalizer({ energy }: { energy: Animated.Value }) {
  const bars = useRef(
    Array.from({ length: EQ_BARS }, (_, i) => ({
      v: new Animated.Value(0.15),
      dur: 260 + ((i * 97) % 220),
      peak: 0.45 + ((i * 53) % 100) / 180,
    })),
  ).current;

  useEffect(() => {
    const loops = bars.map(({ v, dur, peak }) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: peak, duration: dur, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.12 + peak * 0.2, duration: dur * 1.15, easing: Easing.in(Easing.quad), useNativeDriver: true }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.eqRow} pointerEvents="none">
      {bars.map(({ v }, i) => {
        const center = Math.abs(i - (EQ_BARS - 1) / 2) / ((EQ_BARS - 1) / 2); // 0 au centre, 1 aux bords
        return (
          <Animated.View
            key={i}
            style={[
              styles.eqBar,
              {
                backgroundColor: i % 3 === 0 ? MAGENTA : NEON,
                opacity: 0.55 + 0.45 * (1 - center),
                transform: [
                  { scaleY: Animated.multiply(v, energy) },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export default function StudioSplash({ onDone }: { onDone: () => void }) {
  const rootOpacity = useRef(new Animated.Value(1)).current;
  const gridOpacity = useRef(new Animated.Value(0)).current;
  const gridSlide = useRef(new Animated.Value(30)).current; // la grille « avance »
  const eqEnergy = useRef(new Animated.Value(0.001)).current; // amplitude globale de l'égaliseur
  const beam = useRef(new Animated.Value(-1)).current; // faisceau qui balaie (-1 → 1)
  const beatPulse = useRef(new Animated.Value(0)).current; // flash/onde sur chaque beat
  const letterVals = useRef(LETTERS.map(() => new Animated.Value(0))).current;
  const prodVal = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(1)).current;
  const haloSpin = useRef(new Animated.Value(0)).current; // anneau orbital du logo
  const doneRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    // Anneau orbital en rotation continue autour du logo
    const spinLoop = Animated.loop(
      Animated.timing(haloSpin, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }),
    );
    spinLoop.start();

    // Faisceau lumineux : deux balayages
    const beamAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(beam, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(beam, { toValue: -1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    beamAnim.start();

    // Un beat : onde + petit zoom du logo
    const beat = (strength = 1) =>
      Animated.parallel([
        Animated.sequence([
          Animated.timing(beatPulse, { toValue: strength, duration: 60, useNativeDriver: true }),
          Animated.timing(beatPulse, { toValue: 0, duration: 340, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(logoScale, { toValue: 1 + 0.06 * strength, duration: 70, useNativeDriver: true }),
          Animated.timing(logoScale, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
        ]),
      ]);

    // Chute des lettres une à une (novembre décalé de 90 ms)
    const lettersIn = Animated.stagger(
      90,
      letterVals.map((v) =>
        Animated.timing(v, { toValue: 1, duration: 320, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }),
      ),
    );

    // « prod. » : allumage néon qui grésille
    const prodIn = Animated.sequence([
      Animated.timing(prodVal, { toValue: 0.6, duration: 70, useNativeDriver: true }),
      Animated.timing(prodVal, { toValue: 0.1, duration: 90, useNativeDriver: true }),
      Animated.timing(prodVal, { toValue: 0.9, duration: 60, useNativeDriver: true }),
      Animated.timing(prodVal, { toValue: 0.3, duration: 100, useNativeDriver: true }),
      Animated.timing(prodVal, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]);

    // Timeline principale
    Animated.sequence([
      // La grille s'illumine et avance
      Animated.parallel([
        Animated.timing(gridOpacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(gridSlide, { toValue: 0, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(eqEnergy, { toValue: 1, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]),
      // 4 beats pendant que les lettres tombent
      Animated.parallel([
        Animated.sequence([beat(), Animated.delay(540), beat(), Animated.delay(540), beat(), Animated.delay(540), beat()]),
        Animated.sequence([Animated.delay(500), lettersIn]),
      ]),
      // « prod. » s'allume
      prodIn,
      Animated.delay(250),
      // Drop final : grosse pulsation
      beat(1.6),
      Animated.delay(1100),
      // Fondu de sortie
      Animated.timing(rootOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(finish);

    // Vibrations calées sur les beats
    if (Platform.OS !== 'web') {
      BEAT_TIMES.forEach((t, i) => {
        timersRef.current.push(
          setTimeout(
            () =>
              Haptics.impactAsync(
                i === BEAT_TIMES.length - 1 ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light,
              ).catch(() => {}),
            t,
          ),
        );
      });
    }

    return () => {
      spinLoop.stop();
      beamAnim.stop();
      timersRef.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const beamX = beam.interpolate({ inputRange: [-1, 1], outputRange: [-220, 220] });
  const spin = haloSpin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const waveScale = beatPulse.interpolate({ inputRange: [0, 1.6], outputRange: [0.6, 2.6] });
  const waveOpacity = beatPulse.interpolate({ inputRange: [0, 0.15, 1.6], outputRange: [0, 0.8, 0] });

  return (
    <Animated.View style={[styles.root, { opacity: rootOpacity }]} pointerEvents="auto">
      <Pressable style={StyleSheet.absoluteFill} onPress={finish}>
        {/* Grille rétro-futuriste en perspective (sol du studio) */}
        <Animated.View style={[styles.gridWrap, { opacity: gridOpacity, transform: [{ translateY: gridSlide }] }]} pointerEvents="none">
          {Array.from({ length: 7 }, (_, i) => (
            <View key={`h${i}`} style={[styles.gridH, { bottom: 12 + i * (14 + i * 5), opacity: 1 - i * 0.11 }]} />
          ))}
          {Array.from({ length: 9 }, (_, i) => {
            const offset = (i - 4) * 46;
            const tilt = (i - 4) * 6;
            return (
              <View
                key={`v${i}`}
                style={[styles.gridV, { marginLeft: offset, transform: [{ rotate: `${tilt}deg` }] }]}
              />
            );
          })}
        </Animated.View>

        {/* Halo violet ambiant */}
        <View style={styles.ambient} pointerEvents="none" />

        {/* Faisceau lumineux qui balaie la scène */}
        <Animated.View style={[styles.beam, { transform: [{ translateX: beamX }, { rotate: '14deg' }] }]} pointerEvents="none" />

        {/* Égaliseur géant derrière le logo */}
        <Equalizer energy={eqEnergy} />

        {/* Onde de choc sur chaque beat */}
        <Animated.View
          pointerEvents="none"
          style={[styles.beatWave, { opacity: waveOpacity, transform: [{ scale: waveScale }] }]}
        />

        {/* Logo néon */}
        <Animated.View style={[styles.logoWrap, { transform: [{ scale: logoScale }] }]} pointerEvents="none">
          {/* Anneau orbital */}
          <Animated.View style={[styles.orbit, { transform: [{ rotate: spin }] }]}>
            <View style={styles.orbitDot} />
            <View style={[styles.orbitDot, styles.orbitDotMagenta]} />
          </Animated.View>

          <View style={styles.lettersRow}>
            {LETTERS.map((ch, i) => (
              <Animated.Text
                key={i}
                style={[
                  styles.letter,
                  // Double halo : magenta décalé via textShadow sur une couche, cyan sur l'autre
                  i % 2 === 0 ? styles.letterCyan : styles.letterMagenta,
                  {
                    opacity: letterVals[i],
                    transform: [
                      { translateY: letterVals[i].interpolate({ inputRange: [0, 1], outputRange: [-46, 0] }) },
                      { scale: letterVals[i].interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) },
                    ],
                  },
                ]}
              >
                {ch}
              </Animated.Text>
            ))}
          </View>
          <Animated.View style={[styles.prodRow, { opacity: prodVal }]}>
            <View style={styles.prodLine} />
            <Text style={styles.prodText}>prod.</Text>
            <View style={styles.prodLine} />
          </Animated.View>
        </Animated.View>

        <Text style={styles.skipHint}>Toucher pour passer</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG,
    zIndex: 9999,
    elevation: 9999,
    overflow: 'hidden',
  },
  // Grille sol
  gridWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 190, alignItems: 'center' },
  gridH: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: GRID },
  gridV: { position: 'absolute', bottom: 0, height: 190, width: 1, backgroundColor: GRID },
  ambient: {
    position: 'absolute',
    top: '8%',
    alignSelf: 'center',
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: VIOLET,
    opacity: 0.10,
  },
  beam: {
    position: 'absolute',
    top: -80,
    alignSelf: 'center',
    width: 46,
    height: 560,
    backgroundColor: 'rgba(0,229,255,0.07)',
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: 'rgba(0,229,255,0.12)',
  },
  // Égaliseur
  eqRow: {
    position: 'absolute',
    bottom: '26%',
    left: 0,
    right: 0,
    height: 130,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 7,
  },
  eqBar: {
    width: 10,
    height: 130,
    borderRadius: 5,
    // scaleY part du bas :
    transform: [{ translateY: 0 }],
  },
  beatWave: {
    position: 'absolute',
    top: '38%',
    alignSelf: 'center',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 2,
    borderColor: NEON,
  },
  // Logo
  logoWrap: { position: 'absolute', top: '36%', left: 0, right: 0, alignItems: 'center' },
  orbit: {
    position: 'absolute',
    top: -46,
    width: 220,
    height: 130,
    borderRadius: 110,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.18)',
  },
  orbitDot: {
    position: 'absolute',
    top: -3,
    left: '50%',
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: NEON,
    shadowColor: NEON,
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  orbitDotMagenta: { top: undefined, bottom: -3, backgroundColor: MAGENTA, shadowColor: MAGENTA },
  lettersRow: { flexDirection: 'row', alignItems: 'flex-end' },
  letter: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 2,
    marginHorizontal: 1,
  },
  letterCyan: {
    color: '#EAFDFF',
    textShadowColor: NEON,
    textShadowRadius: 16,
    textShadowOffset: { width: 0, height: 0 },
  },
  letterMagenta: {
    color: '#FFEAF5',
    textShadowColor: MAGENTA,
    textShadowRadius: 16,
    textShadowOffset: { width: 0, height: 0 },
  },
  prodRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  prodLine: { width: 42, height: 1, backgroundColor: 'rgba(0,229,255,0.5)' },
  prodText: {
    color: NEON,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 7,
    textShadowColor: NEON,
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  skipHint: {
    position: 'absolute',
    bottom: 34,
    alignSelf: 'center',
    color: 'rgba(234,253,255,0.30)',
    fontSize: 12,
    letterSpacing: 1,
  },
});
