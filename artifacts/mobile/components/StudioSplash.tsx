/**
 * StudioSplash — cinématique d'intro vidéo pour Forge & Kingdoms.
 *
 * expo-video utilise un module natif absent d'Expo Go.
 * → lazy require dans un try/catch : si le module est manquant,
 *   on affiche un écran noir puis on appelle onDone() immédiatement.
 * → Si le module est présent (build standalone / dev build),
 *   on joue le clip assets/videos/intro.mp4 en plein écran.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
} from 'react-native';

// ── Lazy require expo-video ───────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ExpoVideo: any = null;
try {
  ExpoVideo = require('expo-video');
} catch (_) {
  // Module natif absent (Expo Go) — on passera au repli
}

const videoSource = require('@/assets/videos/intro.mp4');
const VIDEO_DURATION_MS = 10_200; // durée vidéo ~10 s + marge

// ── Repli minimal (Expo Go / module absent) ───────────────────────────────────
function FallbackSplash({ onDone }: { onDone: () => void }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    // Bref flash noir pour indiquer un démarrage, puis onDone
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true })
        .start(() => onDone());
    }, 400);
    return () => clearTimeout(t);
  }, [onDone, opacity]);
  return <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', zIndex: 9999, opacity }]} />;
}

// ── Lecteur vidéo complet ─────────────────────────────────────────────────────
function VideoSplash({ onDone }: { onDone: () => void }) {
  const { useVideoPlayer, VideoView } = ExpoVideo;
  const { width, height } = useWindowDimensions();

  const rootOpacity  = useRef(new Animated.Value(1)).current;
  const videoOpacity = useRef(new Animated.Value(0)).current;
  const doneRef       = useRef(false);
  const readyRef      = useRef(false);
  const wasPlayingRef = useRef(false);
  const [showSkip, setShowSkip] = useState(false);

  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    Animated.timing(rootOpacity, { toValue: 0, duration: 400, useNativeDriver: true })
      .start(() => onDone());
  }, [rootOpacity, onDone]);

  const player = useVideoPlayer(videoSource, (p: { loop: boolean; muted: boolean }) => {
    p.loop  = false;
    p.muted = Platform.OS === 'web';
  });

  useEffect(() => {
    const statusSub = player.addListener('statusChange', (evt: { status: string }) => {
      if (evt.status === 'readyToPlay' && !readyRef.current) {
        readyRef.current = true;
        try { player.play(); } catch (_) {}
        Animated.timing(videoOpacity, { toValue: 1, duration: 350, useNativeDriver: true }).start();
        setTimeout(() => setShowSkip(true), 1000);
      }
    });
    const playingSub = player.addListener('playingChange', (evt: { isPlaying: boolean }) => {
      if (evt.isPlaying) {
        wasPlayingRef.current = true;
      } else if (wasPlayingRef.current) {
        finish();
      }
    });
    return () => { statusSub.remove(); playingSub.remove(); };
  }, [player, videoOpacity, finish]);

  // Repli si la vidéo ne démarre pas en 4 s
  useEffect(() => {
    const t = setTimeout(() => { if (!readyRef.current) finish(); }, 4000);
    return () => clearTimeout(t);
  }, [finish]);

  // Repli durée maximale
  useEffect(() => {
    const t = setTimeout(() => finish(), VIDEO_DURATION_MS + 1000);
    return () => clearTimeout(t);
  }, [finish]);

  return (
    <Animated.View style={[styles.root, { width, height, opacity: rootOpacity }]}>
      <Animated.View style={{ opacity: videoOpacity }}>
        <VideoView
          player={player}
          style={{ width, height }}
          contentFit="contain"
          nativeControls={false}
        />
      </Animated.View>
      {showSkip && (
        <Pressable style={styles.skipBtn} onPress={finish} hitSlop={16}>
          <Text style={styles.skipText}>Passer ›</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

// ── Export principal ──────────────────────────────────────────────────────────
export default function StudioSplash({ onDone }: { onDone: () => void }) {
  if (!ExpoVideo) return <FallbackSplash onDone={onDone} />;
  return <VideoSplash onDone={onDone} />;
}

const styles = StyleSheet.create({
  root: {
    position:        'absolute',
    top:             0,
    left:            0,
    backgroundColor: '#000',
    zIndex:          9999,
    elevation:       9999,
    overflow:        'hidden',
  },
  skipBtn: {
    position:          'absolute',
    bottom:            40,
    right:             24,
    paddingHorizontal: 18,
    paddingVertical:   9,
    backgroundColor:   'rgba(0,0,0,0.45)',
    borderRadius:      20,
    borderWidth:       1,
    borderColor:       'rgba(232,184,75,0.35)',
  },
  skipText: {
    color:         'rgba(232,184,75,0.85)',
    fontSize:      13,
    fontWeight:    '600',
    letterSpacing: 1.5,
  },
});
