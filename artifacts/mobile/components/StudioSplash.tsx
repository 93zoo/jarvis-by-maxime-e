/**
 * StudioSplash — intro cinématique aux couleurs du jeu (forge médiévale).
 *
 * Séquence : noir → braises qui montent dans l'atelier → l'enclume apparaît à
 * la lueur du feu → le marteau frappe 4 fois : à chaque coup, éclair, gerbe
 * d'étincelles, vibration… et deux lettres de MAXIME-E sont estampées dans le
 * métal chauffé à blanc → « prod. » s'embrase → le métal « refroidit » (les
 * lettres passent du blanc-or au doré) → fondu vers le jeu. Toucher = passer.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

const BG = '#0A0603';
const GOLD = '#E8B84B';
const EMBER = '#FF6A1F';
const EMBER_DEEP = '#8F2E08';
const HOT = '#FFE9C4'; // métal chauffé à blanc
const STEEL = '#3A3E45';
const STEEL_DARK = '#1E2126';

const LETTERS = 'MAXIME-E'.split('');
const STRIKE_TIMES = [1000, 1650, 2300, 2950]; // 4 frappes, 2 lettres estampées par frappe
const SPARKS_PER_BURST = 12;
const EMBER_COUNT = 10;

/** Gerbe d'étincelles projetée depuis l'enclume. */
function SparkBurst({ progress }: { progress: Animated.Value }) {
  const dirs = useRef(
    Array.from({ length: SPARKS_PER_BURST }, (_, i) => {
      const angle = Math.PI * (0.12 + (0.76 * i) / (SPARKS_PER_BURST - 1));
      const dist = 60 + ((i * 37) % 70);
      return { dx: Math.cos(angle) * dist * (i % 2 === 0 ? 1 : -1), dy: -Math.sin(angle) * dist };
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
            i % 3 === 0 && { backgroundColor: GOLD },
            {
              opacity: progress.interpolate({ inputRange: [0, 0.08, 1], outputRange: [0, 1, 0] }),
              transform: [
                { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, d.dx] }) },
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, d.dy + 26] }) },
                { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.15] }) },
              ],
            },
          ]}
        />
      ))}
    </>
  );
}

/** Braises qui montent lentement en fond, comme dans l'atelier du jeu. */
function RisingEmbers() {
  const embers = useRef(
    Array.from({ length: EMBER_COUNT }, (_, i) => ({
      v: new Animated.Value(0),
      x: ((i * 83) % 100) / 100, // position horizontale 0..1
      size: 3 + (i % 3) * 2,
      dur: 2600 + ((i * 331) % 1800),
      delay: (i * 217) % 1500,
    })),
  ).current;

  useEffect(() => {
    const loops = embers.map(({ v, dur, delay }) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.out(Easing.quad), useNativeDriver: true }),
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
      {embers.map(({ v, x, size }, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            bottom: '18%',
            left: `${8 + x * 84}%`,
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: i % 2 === 0 ? EMBER : GOLD,
            opacity: v.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 0.9, 0.5, 0] }),
            transform: [
              { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -320] }) },
              { translateX: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, i % 2 === 0 ? 14 : -14, 0] }) },
            ],
          }}
        />
      ))}
    </View>
  );
}

export default function StudioSplash({ onDone }: { onDone: () => void }) {
  const rootOpacity = useRef(new Animated.Value(1)).current;
  const sceneOpacity = useRef(new Animated.Value(0)).current;
  const forgeGlow = useRef(new Animated.Value(0.4)).current;
  const hammerAngle = useRef(new Animated.Value(-1)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const sparks = useRef(STRIKE_TIMES.map(() => new Animated.Value(0))).current;
  const letterVals = useRef(LETTERS.map(() => new Animated.Value(0))).current;
  const cooled = useRef(new Animated.Value(0)).current; // 0 = chauffé à blanc, 1 = doré refroidi
  const prodVal = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    // Respiration des braises de la forge
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(forgeGlow, { toValue: 1, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(forgeGlow, { toValue: 0.4, duration: 750, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    glowLoop.start();

    // Une frappe : levée → coup sec → éclair + étincelles + 2 lettres estampées
    const strike = (i: number) => {
      const stamped = letterVals.slice(i * 2, i * 2 + 2);
      return Animated.sequence([
        Animated.timing(hammerAngle, { toValue: -1, duration: 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(hammerAngle, { toValue: 0, duration: 120, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(flash, { toValue: 1, duration: 40, useNativeDriver: true }),
            Animated.timing(flash, { toValue: 0, duration: 240, useNativeDriver: true }),
          ]),
          Animated.timing(sparks[i], { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
          Animated.stagger(
            70,
            stamped.map((v) =>
              Animated.timing(v, { toValue: 1, duration: 220, easing: Easing.out(Easing.back(2.2)), useNativeDriver: true }),
            ),
          ),
        ]),
      ]);
    };

    // Timeline principale
    Animated.sequence([
      Animated.timing(sceneOpacity, { toValue: 1, duration: 750, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.delay(150),
      strike(0),
      strike(1),
      strike(2),
      strike(3),
      // « prod. » s'embrase en grésillant
      Animated.sequence([
        Animated.timing(prodVal, { toValue: 0.6, duration: 70, useNativeDriver: true }),
        Animated.timing(prodVal, { toValue: 0.15, duration: 90, useNativeDriver: true }),
        Animated.timing(prodVal, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]),
      // Le métal refroidit : blanc-or → doré (fondu croisé entre deux couches,
      // 100 % native driver — ne jamais animer une couleur ici, ça fait planter
      // le natif quand l'élément est déjà piloté par le driver natif)
      Animated.timing(cooled, { toValue: 1, duration: 900, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.delay(800),
      Animated.timing(rootOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(finish);

    // Vibrations calées sur les frappes
    if (Platform.OS !== 'web') {
      STRIKE_TIMES.forEach((t) => {
        timersRef.current.push(
          setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), t),
        );
      });
      timersRef.current.push(
        setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}), 3800),
      );
    }

    return () => {
      glowLoop.stop();
      timersRef.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hammerRotate = hammerAngle.interpolate({ inputRange: [-1, 0], outputRange: ['-70deg', '6deg'] });
  const stillHot = cooled.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });

  return (
    <Animated.View style={[styles.root, { opacity: rootOpacity }]} pointerEvents="auto">
      <Pressable style={StyleSheet.absoluteFill} onPress={finish}>
        <Animated.View style={[styles.scene, { opacity: sceneOpacity }]}>
          {/* Lueur de la forge */}
          <Animated.View style={[styles.forgeGlow, { opacity: forgeGlow }]} />
          <Animated.View style={[styles.forgeCore, { opacity: forgeGlow }]} />

          {/* Braises qui montent */}
          <RisingEmbers />

          {/* Marteau qui frappe au-dessus de l'enclume */}
          <Animated.View style={[styles.hammerPivot, { transform: [{ rotate: hammerRotate }] }]}>
            <View style={styles.hammerHandle} />
            <View style={styles.hammerHead} />
          </Animated.View>

          {/* Enclume */}
          <View style={styles.anvilTop} />
          <View style={styles.anvilNeck} />
          <View style={styles.anvilBase} />

          {/* Étincelles des frappes */}
          <View style={styles.sparkOrigin}>
            {sparks.map((p, i) => (
              <SparkBurst key={i} progress={p} />
            ))}
          </View>

          {/* Lettres estampées dans le métal */}
          <View style={styles.lettersRow} pointerEvents="none">
            {LETTERS.map((ch, i) => {
              const scale = letterVals[i].interpolate({ inputRange: [0, 1], outputRange: [2.4, 1] });
              return (
                <View key={i}>
                  {/* Couche « métal chauffé à blanc » */}
                  <Animated.Text
                    style={[
                      styles.letter,
                      { color: HOT, opacity: Animated.multiply(letterVals[i], stillHot), transform: [{ scale }] },
                    ]}
                  >
                    {ch}
                  </Animated.Text>
                  {/* Couche « métal refroidi doré » superposée */}
                  <Animated.Text
                    style={[
                      styles.letter,
                      styles.letterOverlay,
                      { color: GOLD, opacity: Animated.multiply(letterVals[i], cooled), transform: [{ scale }] },
                    ]}
                  >
                    {ch}
                  </Animated.Text>
                </View>
              );
            })}
          </View>
          <Animated.View style={[styles.prodRow, { opacity: prodVal }]} pointerEvents="none">
            <View style={styles.prodLine} />
            <Text style={styles.prodText}>prod.</Text>
            <View style={styles.prodLine} />
          </Animated.View>
        </Animated.View>

        {/* Éclair plein écran à l'impact */}
        <Animated.View pointerEvents="none" style={[styles.flash, { opacity: flash }]} />

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
  scene: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  forgeGlow: {
    position: 'absolute',
    bottom: '12%',
    alignSelf: 'center',
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: EMBER_DEEP,
    opacity: 0.5,
    transform: [{ scaleY: 0.5 }],
  },
  forgeCore: {
    position: 'absolute',
    bottom: '17%',
    alignSelf: 'center',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: EMBER,
    transform: [{ scaleY: 0.45 }],
  },
  // Marteau (pivot à gauche, tête à droite au-dessus de l'enclume)
  hammerPivot: {
    position: 'absolute',
    bottom: '47%',
    left: '50%',
    marginLeft: -120,
    width: 130,
    height: 16,
    justifyContent: 'center',
  },
  hammerHandle: { width: 120, height: 9, borderRadius: 5, backgroundColor: '#4A3320' },
  hammerHead: {
    position: 'absolute',
    right: -8,
    top: -16,
    width: 30,
    height: 42,
    borderRadius: 6,
    backgroundColor: STEEL,
    borderWidth: 2,
    borderColor: '#14161A',
  },
  // Enclume
  anvilTop: { position: 'absolute', bottom: '40%', alignSelf: 'center', width: 170, height: 28, borderRadius: 8, backgroundColor: STEEL },
  anvilNeck: { position: 'absolute', bottom: '36%', alignSelf: 'center', width: 48, height: 34, backgroundColor: STEEL_DARK },
  anvilBase: { position: 'absolute', bottom: '33.5%', alignSelf: 'center', width: 104, height: 20, borderRadius: 5, backgroundColor: STEEL_DARK },
  sparkOrigin: { position: 'absolute', bottom: '42%', alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  spark: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFC46B',
    shadowColor: EMBER,
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  // Lettres estampées au centre, au-dessus de l'enclume
  lettersRow: {
    position: 'absolute',
    top: '30%',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  letterOverlay: { position: 'absolute', left: 0, top: 0 },
  letter: {
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 3,
    marginHorizontal: 1,
    textShadowColor: EMBER,
    textShadowRadius: 16,
    textShadowOffset: { width: 0, height: 0 },
  },
  prodRow: {
    position: 'absolute',
    top: '37.5%',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  prodLine: { width: 42, height: 1, backgroundColor: 'rgba(232,184,75,0.55)' },
  prodText: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 7,
    textShadowColor: EMBER,
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 0 },
  },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFF3DF' },
  skipHint: {
    position: 'absolute',
    bottom: 34,
    alignSelf: 'center',
    color: 'rgba(245,239,226,0.32)',
    fontSize: 12,
    letterSpacing: 1,
  },
});
