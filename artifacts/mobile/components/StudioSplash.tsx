/**
 * StudioSplash — intro cinématique « style Netflix » au lancement du jeu.
 *
 * Séquence : atelier sombre à la lueur de la forge → le forgeron martèle
 * (3 frappes : éclair, gerbe d'étincelles, vibration, la caméra se rapproche
 * à chaque coup) → dans le métal écrasé, le néon s'allume en grésillant :
 * « MAXIME-E prod. » → fondu vers le jeu. Toucher l'écran passe l'intro.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

const COAL = '#080502';
const EMBER = '#FF6A1F';
const EMBER_DEEP = '#B23A0A';
const STEEL = '#3B3F46';
const STEEL_DARK = '#23262B';
const NEON = '#00E5FF';

const STRIKE_TIMES = [900, 1700, 2500]; // instants des frappes (ms)
const SPARKS_PER_BURST = 10;

/** Gerbe d'étincelles projetée depuis l'enclume à chaque frappe. */
function SparkBurst({ progress }: { progress: Animated.Value }) {
  // Directions pré-calculées (déterministes pour éviter tout re-render coûteux)
  const dirs = useRef(
    Array.from({ length: SPARKS_PER_BURST }, (_, i) => {
      const angle = (Math.PI * (0.15 + (0.7 * i) / (SPARKS_PER_BURST - 1))); // éventail vers le haut
      const dist = 70 + (i % 3) * 38;
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
            {
              opacity: progress.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 0] }),
              transform: [
                { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, d.dx] }) },
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, d.dy + 30] }) },
                { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0.2] }) },
              ],
            },
          ]}
        />
      ))}
    </>
  );
}

export default function StudioSplash({ onDone }: { onDone: () => void }) {
  const rootOpacity = useRef(new Animated.Value(1)).current;
  const sceneOpacity = useRef(new Animated.Value(0)).current;
  const cameraZoom = useRef(new Animated.Value(1)).current; // la « caméra » se rapproche
  const cameraY = useRef(new Animated.Value(0)).current;
  const forgeGlow = useRef(new Animated.Value(0.4)).current; // respiration des braises
  const hammerAngle = useRef(new Animated.Value(-1)).current; // -1 levé, 0 impact
  const flash = useRef(new Animated.Value(0)).current; // éclair blanc à l'impact
  const sparks = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];
  const neon = useRef(new Animated.Value(0)).current; // allumage du néon
  const neonBuzz = useRef(new Animated.Value(1)).current; // grésillement continu
  const doneRef = useRef(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  useEffect(() => {
    // Respiration des braises pendant toute l'intro
    const glowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(forgeGlow, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(forgeGlow, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    glowLoop.start();

    // Grésillement subtil du néon une fois allumé
    const buzzLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(neonBuzz, { toValue: 0.82, duration: 90, useNativeDriver: true }),
        Animated.timing(neonBuzz, { toValue: 1, duration: 130, useNativeDriver: true }),
        Animated.delay(420),
        Animated.timing(neonBuzz, { toValue: 0.9, duration: 60, useNativeDriver: true }),
        Animated.timing(neonBuzz, { toValue: 1, duration: 90, useNativeDriver: true }),
        Animated.delay(700),
      ]),
    );
    buzzLoop.start();

    // Une frappe de marteau : levée → frappe sèche → éclair + étincelles
    const strike = (i: number) =>
      Animated.sequence([
        Animated.timing(hammerAngle, { toValue: -1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(hammerAngle, { toValue: 0, duration: 130, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.parallel([
          Animated.sequence([
            Animated.timing(flash, { toValue: 1, duration: 40, useNativeDriver: true }),
            Animated.timing(flash, { toValue: 0, duration: 260, useNativeDriver: true }),
          ]),
          Animated.timing(sparks[i], { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      ]);

    // Timeline principale
    Animated.sequence([
      // Ouverture : fondu sur l'atelier
      Animated.timing(sceneOpacity, { toValue: 1, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      Animated.delay(150),
      // 3 frappes — la caméra se rapproche à chaque coup
      Animated.parallel([
        Animated.sequence([strike(0), strike(1), strike(2)]),
        Animated.timing(cameraZoom, { toValue: 2.1, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
        Animated.timing(cameraY, { toValue: 70, duration: 2200, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      ]),
      // Le néon s'allume en grésillant (allumages ratés puis franc)
      Animated.sequence([
        Animated.timing(neon, { toValue: 0.5, duration: 80, useNativeDriver: true }),
        Animated.timing(neon, { toValue: 0.05, duration: 90, useNativeDriver: true }),
        Animated.timing(neon, { toValue: 0.8, duration: 70, useNativeDriver: true }),
        Animated.timing(neon, { toValue: 0.2, duration: 110, useNativeDriver: true }),
        Animated.timing(neon, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]),
      Animated.delay(1500),
      // Fondu de sortie
      Animated.timing(rootOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start(finish);

    // Vibrations synchronisées avec les impacts
    if (Platform.OS !== 'web') {
      STRIKE_TIMES.forEach((t) => {
        timersRef.current.push(
          setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), t),
        );
      });
      timersRef.current.push(
        setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}), 3300),
      );
    }

    return () => {
      glowLoop.stop();
      buzzLoop.stop();
      timersRef.current.forEach(clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hammerRotate = hammerAngle.interpolate({ inputRange: [-1, 0], outputRange: ['-65deg', '8deg'] });

  return (
    <Animated.View style={[styles.root, { opacity: rootOpacity }]} pointerEvents="auto">
      <Pressable style={StyleSheet.absoluteFill} onPress={finish}>
        <Animated.View
          style={[
            styles.scene,
            { opacity: sceneOpacity, transform: [{ scale: cameraZoom }, { translateY: cameraY }] },
          ]}
        >
          {/* Lueur de la forge en arrière-plan */}
          <Animated.View style={[styles.forgeGlow, { opacity: forgeGlow }]} />
          <Animated.View style={[styles.forgeCore, { opacity: forgeGlow }]} />

          {/* Silhouette du forgeron */}
          <View style={styles.smith}>
            <View style={styles.smithHead} />
            <View style={styles.smithBody} />
            {/* Bras + marteau qui frappe */}
            <Animated.View style={[styles.arm, { transform: [{ rotate: hammerRotate }] }]}>
              <View style={styles.armBar} />
              <View style={styles.hammerHead} />
            </Animated.View>
          </View>

          {/* Enclume */}
          <View style={styles.anvilTop} />
          <View style={styles.anvilNeck} />
          <View style={styles.anvilBase} />

          {/* Étincelles des trois frappes */}
          <View style={styles.sparkOrigin}>
            {sparks.map((p, i) => (
              <SparkBurst key={i} progress={p} />
            ))}
          </View>

          {/* Le métal écrasé où le néon s'allume */}
          <Animated.View style={[styles.neonWrap, { opacity: Animated.multiply(neon, neonBuzz) }]}>
            <Text style={styles.neonText}>MAXIME-E</Text>
            <Text style={styles.neonSub}>prod.</Text>
          </Animated.View>
        </Animated.View>

        {/* Éclair blanc plein écran à l'impact */}
        <Animated.View pointerEvents="none" style={[styles.flash, { opacity: flash }]} />

        <Text style={styles.skipHint}>Toucher pour passer</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: COAL,
    zIndex: 9999,
    elevation: 9999,
    overflow: 'hidden',
  },
  scene: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  forgeGlow: {
    position: 'absolute',
    bottom: '18%',
    width: 340,
    height: 340,
    borderRadius: 170,
    backgroundColor: EMBER_DEEP,
    opacity: 0.5,
    transform: [{ scaleY: 0.55 }],
  },
  forgeCore: {
    position: 'absolute',
    bottom: '24%',
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: EMBER,
    transform: [{ scaleY: 0.5 }],
  },
  // Forgeron (silhouette stylisée)
  smith: { position: 'absolute', bottom: '43%', left: '18%', alignItems: 'center' },
  smithHead: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#120C06' },
  smithBody: {
    width: 54,
    height: 84,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: '#120C06',
    marginTop: -4,
  },
  arm: {
    position: 'absolute',
    top: 26,
    right: -58,
    width: 74,
    height: 12,
    justifyContent: 'center',
  },
  armBar: { width: 74, height: 9, borderRadius: 5, backgroundColor: '#120C06' },
  hammerHead: {
    position: 'absolute',
    right: -14,
    top: -12,
    width: 26,
    height: 34,
    borderRadius: 5,
    backgroundColor: STEEL,
    borderWidth: 2,
    borderColor: '#14161A',
  },
  // Enclume
  anvilTop: {
    position: 'absolute',
    bottom: '38%',
    width: 150,
    height: 26,
    borderRadius: 8,
    backgroundColor: STEEL,
  },
  anvilNeck: { position: 'absolute', bottom: '34.5%', width: 44, height: 30, backgroundColor: STEEL_DARK },
  anvilBase: {
    position: 'absolute',
    bottom: '32%',
    width: 96,
    height: 20,
    borderRadius: 5,
    backgroundColor: STEEL_DARK,
  },
  sparkOrigin: { position: 'absolute', bottom: '40%', alignItems: 'center', justifyContent: 'center' },
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
  // Néon écrasé dans le métal
  neonWrap: { position: 'absolute', bottom: '39.5%', alignItems: 'center' },
  neonText: {
    color: NEON,
    fontSize: 21,
    fontWeight: '900',
    letterSpacing: 3,
    textShadowColor: NEON,
    textShadowRadius: 14,
    textShadowOffset: { width: 0, height: 0 },
  },
  neonSub: {
    color: NEON,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 6,
    marginTop: 1,
    textShadowColor: NEON,
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 0 },
  },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFF6E8' },
  skipHint: {
    position: 'absolute',
    bottom: 34,
    alignSelf: 'center',
    color: 'rgba(245,239,226,0.35)',
    fontSize: 12,
    letterSpacing: 1,
  },
});
