/**
 * StudioSplash — intro de Forge & Kingdoms.
 *
 * • En Expo Go (Constants.appOwnership === 'expo') :
 *   FallbackSplash — cinématique purement animée (forge + flammes + titre).
 *
 * • En build natif / standalone :
 *   VideoSplash — lecture de assets/videos/intro.mp4 via expo-video.
 *   Si expo-video n'est pas disponible (require échoue), repli sur FallbackSplash.
 *
 * Toucher l'écran à tout moment = passer.
 */

import Constants from 'expo-constants';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

// ─── Détection Expo Go ───────────────────────────────────────────────────────
const IS_EXPO_GO = (Constants.appOwnership as string) === 'expo';

// ─── Palette ─────────────────────────────────────────────────────────────────
const BG        = '#060200';
const GOLD      = '#E8B84B';
const EMBER     = '#FF6A1F';
const EMBER2    = '#FF3D00';
const DEEP_RED  = '#6A1502';
const HOT_WHITE = '#FFF4E8';

const N_EMBERS = 22;
const N_SPARKS = 22;

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components AVANT FallbackSplash (règle Hermes)
// ─────────────────────────────────────────────────────────────────────────────

function SparkBurst({ progress, seed = 0 }: { progress: Animated.Value; seed?: number }) {
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
              width: d.size, height: d.size, borderRadius: d.size / 2,
              backgroundColor: d.color,
              opacity: progress.interpolate({ inputRange: [0, 0.06, 0.65, 1], outputRange: [0, 1, 0.55, 0] }),
              transform: [
                { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, d.dx] }) },
                { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, d.dy + 28] }) },
                { scale:      progress.interpolate({ inputRange: [0, 0.45, 1], outputRange: [1.3, 0.8, 0.08] }) },
              ],
            },
          ]}
        />
      ))}
    </>
  );
}

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
          Animated.timing(v, { toValue: 1, duration: dur, useNativeDriver: false, easing: Easing.linear }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: false }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, []);

  const { height } = useWindowDimensions();
  return (
    <>
      {embers.map((e, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={{
            position: 'absolute',
            left:     `${e.x * 100}%` as any,
            bottom:   0,
            width:    e.size,
            height:   e.size,
            borderRadius: e.size / 2,
            backgroundColor: e.color,
            opacity: e.v.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 0.6, 0] }),
            transform: [{ translateY: e.v.interpolate({ inputRange: [0, 1], outputRange: [0, -height * 0.6] }) }],
          }}
        />
      ))}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FallbackSplash — cinématique animée pure (Expo Go & fallback)
// ─────────────────────────────────────────────────────────────────────────────

function FallbackSplash({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();

  const screenOp   = useRef(new Animated.Value(1)).current;
  const fireScale  = useRef(new Animated.Value(0)).current;
  const fireOp     = useRef(new Animated.Value(0)).current;
  const forgeY     = useRef(new Animated.Value(-120)).current;
  const forgeOp    = useRef(new Animated.Value(0)).current;
  const ampersOp   = useRef(new Animated.Value(0)).current;
  const kingdomsY  = useRef(new Animated.Value(120)).current;
  const kingdomsOp = useRef(new Animated.Value(0)).current;
  const taglineOp  = useRef(new Animated.Value(0)).current;
  const flashOp1   = useRef(new Animated.Value(0)).current;
  const flashOp2   = useRef(new Animated.Value(0)).current;
  const sparks1    = useRef(new Animated.Value(0)).current;
  const sparks2    = useRef(new Animated.Value(0)).current;
  const doneRef    = useRef(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } catch {}
    Animated.timing(screenOp, { toValue: 0, duration: 500, useNativeDriver: false }).start(() => onDone());
  }, [screenOp, onDone]);

  useEffect(() => {
    const seq = Animated.sequence([
      Animated.delay(200),
      Animated.parallel([
        Animated.timing(fireScale, { toValue: 1, duration: 900, useNativeDriver: false, easing: Easing.out(Easing.cubic) }),
        Animated.timing(fireOp,   { toValue: 1, duration: 700, useNativeDriver: false }),
      ]),
      Animated.delay(200),
      // FORGE
      Animated.parallel([
        Animated.spring(forgeY,  { toValue: 0, useNativeDriver: false, tension: 90, friction: 8 }),
        Animated.timing(forgeOp, { toValue: 1, duration: 250, useNativeDriver: false }),
        Animated.sequence([
          Animated.timing(flashOp1, { toValue: 1, duration: 60, useNativeDriver: false }),
          Animated.timing(flashOp1, { toValue: 0, duration: 180, useNativeDriver: false }),
        ]),
        Animated.sequence([
          Animated.delay(60),
          Animated.timing(sparks1, { toValue: 1, duration: 700, useNativeDriver: false }),
        ]),
      ]),
      Animated.delay(250),
      Animated.timing(ampersOp, { toValue: 1, duration: 300, useNativeDriver: false }),
      Animated.delay(150),
      // KINGDOMS
      Animated.parallel([
        Animated.spring(kingdomsY,  { toValue: 0, useNativeDriver: false, tension: 90, friction: 8 }),
        Animated.timing(kingdomsOp, { toValue: 1, duration: 250, useNativeDriver: false }),
        Animated.sequence([
          Animated.timing(flashOp2, { toValue: 1, duration: 60, useNativeDriver: false }),
          Animated.timing(flashOp2, { toValue: 0, duration: 180, useNativeDriver: false }),
        ]),
        Animated.sequence([
          Animated.delay(60),
          Animated.timing(sparks2, { toValue: 1, duration: 700, useNativeDriver: false }),
        ]),
      ]),
      Animated.delay(350),
      Animated.timing(taglineOp,  { toValue: 1, duration: 500, useNativeDriver: false }),
      Animated.delay(1800),
    ]);
    seq.start(() => finish());
  }, []);

  return (
    <Pressable style={[styles.root, { width, height, backgroundColor: BG }]} onPress={finish}>
      <Animated.View
        style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'flex-end', paddingBottom: height * 0.08 }]}
      >
        <Animated.View
          style={{
            width: width * 1.4, height: height * 0.55,
            borderRadius: (width * 1.4) / 2,
            backgroundColor: DEEP_RED,
            opacity: fireOp,
            transform: [{ scaleX: fireScale }, { scaleY: fireScale }],
          }}
        />
        <Animated.View
          style={{
            ...StyleSheet.absoluteFillObject,
            width: width * 1.1, height: height * 0.42,
            alignSelf: 'center',
            bottom: height * 0.04,
            borderRadius: (width * 1.1) / 2,
            backgroundColor: EMBER2,
            opacity: fireOp,
            transform: [{ scaleX: fireScale }, { scaleY: fireScale }],
          }}
        />
        <Animated.View
          style={{
            ...StyleSheet.absoluteFillObject,
            width: width * 0.72, height: height * 0.3,
            alignSelf: 'center',
            bottom: height * 0.06,
            borderRadius: (width * 0.72) / 2,
            backgroundColor: EMBER,
            opacity: fireOp,
            transform: [{ scaleX: fireScale }, { scaleY: fireScale }],
          }}
        />
      </Animated.View>

      <RisingEmbers />

      {/* Bandes letterbox */}
      <View style={[styles.letterbox, { top: 0, height: height * 0.22 }]} />
      <View style={[styles.letterbox, { bottom: 0, height: height * 0.22 }]} />

      {/* Titre */}
      <View style={styles.titleBlock}>
        {/* FORGE */}
        <View style={styles.sparksTop} pointerEvents="none">
          <SparkBurst progress={sparks1} seed={0} />
        </View>
        <Animated.Text style={[styles.mainTitle, { opacity: forgeOp, transform: [{ translateY: forgeY }], color: GOLD }]}>
          FORGE
        </Animated.Text>

        {/* Flash FORGE */}
        <Animated.View style={[styles.flash, { opacity: flashOp1 }]} pointerEvents="none" />

        {/* & */}
        <Animated.Text style={[styles.ampersand, { opacity: ampersOp }]}>&</Animated.Text>

        {/* KINGDOMS */}
        <View style={styles.sparksBot} pointerEvents="none">
          <SparkBurst progress={sparks2} seed={1} />
        </View>
        <Animated.Text style={[styles.mainTitle, { opacity: kingdomsOp, transform: [{ translateY: kingdomsY }], color: GOLD }]}>
          KINGDOMS
        </Animated.Text>

        {/* Flash KINGDOMS */}
        <Animated.View style={[styles.flash, { opacity: flashOp2 }]} pointerEvents="none" />
      </View>

      <Animated.Text style={[styles.tagline, { opacity: taglineOp }]}>
        FORGEZ VOTRE LÉGENDE
      </Animated.Text>

      <Animated.View style={[StyleSheet.absoluteFill, { opacity: screenOp, backgroundColor: BG }]} pointerEvents="none" />

      <Text style={styles.skipHint}>Toucher pour passer</Text>
    </Pressable>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VideoSplash — expo-video (build natif uniquement)
// ─────────────────────────────────────────────────────────────────────────────

let ExpoVideoModule: typeof import('expo-video') | null = null;
if (!IS_EXPO_GO && Platform.OS !== 'web') {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ExpoVideoModule = require('expo-video');
  } catch {
    ExpoVideoModule = null;
  }
}

function VideoSplash({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();
  const rootOpacity = useRef(new Animated.Value(1)).current;
  const doneRef     = useRef(false);
  const [showSkip, setShowSkip] = useState(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    Animated.timing(rootOpacity, { toValue: 0, duration: 400, useNativeDriver: false })
      .start(() => onDone());
  }, [rootOpacity, onDone]);

  useEffect(() => {
    const t = setTimeout(() => finish(), 12_000);
    return () => clearTimeout(t);
  }, [finish]);

  useEffect(() => {
    const t = setTimeout(() => setShowSkip(true), 1000);
    return () => clearTimeout(t);
  }, []);

  if (!ExpoVideoModule) {
    // Module introuvable au runtime → repli immédiat
    useEffect(() => { finish(); }, []);
    return null;
  }

  const { VideoView, useVideoPlayer } = ExpoVideoModule;

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const player = useVideoPlayer(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('../assets/videos/intro.mp4'),
    (p) => {
      p.loop = false;
      p.play();
    },
  );

  useEffect(() => {
    const sub = player.addListener('playingChange', ({ isPlaying }: { isPlaying: boolean }) => {
      if (!isPlaying && player.currentTime > 0.5) finish();
    });
    return () => sub.remove();
  }, [player, finish]);

  return (
    <Animated.View style={[styles.root, { width, height, opacity: rootOpacity }]}>
      <VideoView
        player={player}
        style={{ width, height }}
        contentFit="contain"
        nativeControls={false}
      />
      {showSkip && (
        <Pressable style={styles.skipBtn} onPress={finish} hitSlop={16}>
          <Text style={styles.skipText}>Passer ›</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Export principal
// ─────────────────────────────────────────────────────────────────────────────

export default function StudioSplash({ onDone }: { onDone: () => void }) {
  if (IS_EXPO_GO || Platform.OS === 'web') {
    return <FallbackSplash onDone={onDone} />;
  }
  return <VideoSplash onDone={onDone} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    position: 'absolute', top: 0, left: 0,
    backgroundColor: '#000',
    zIndex: 9999, elevation: 9999,
    overflow: 'hidden',
  },
  letterbox: {
    position: 'absolute', left: 0, right: 0,
    backgroundColor: '#000',
  },
  titleBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  mainTitle: {
    fontSize: 62,
    fontWeight: '900',
    letterSpacing: 10,
    textShadowColor: EMBER,
    textShadowRadius: 28,
    textShadowOffset: { width: 0, height: 0 },
  },
  ampersand: {
    fontSize: 28,
    fontWeight: '700',
    color: GOLD,
    letterSpacing: 4,
    marginVertical: 2,
    opacity: 0.85,
  },
  tagline: {
    position: 'absolute',
    bottom: '28%',
    alignSelf: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(232,184,75,0.65)',
    letterSpacing: 6,
    textShadowColor: EMBER,
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  sparksTop: {
    position: 'absolute', top: '44%',
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
  },
  sparksBot: {
    position: 'absolute', top: '56%',
    alignSelf: 'center', alignItems: 'center', justifyContent: 'center',
  },
  spark: {
    position: 'absolute',
    shadowColor: EMBER, shadowOpacity: 0.9,
    shadowRadius: 5, shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  flash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFE4B0',
  },
  skipHint: {
    position: 'absolute', bottom: 26, alignSelf: 'center',
    color: 'rgba(240,228,200,0.26)',
    fontSize: 11, letterSpacing: 2,
  },
  skipBtn: {
    position: 'absolute', bottom: 40, right: 24,
    paddingHorizontal: 18, paddingVertical: 9,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20, borderWidth: 1,
    borderColor: 'rgba(232,184,75,0.35)',
  },
  skipText: {
    color: 'rgba(232,184,75,0.85)',
    fontSize: 13, fontWeight: '600', letterSpacing: 1.5,
  },
});
