/**
 * StudioSplash — cinématique d'intro vidéo pour Forge & Kingdoms.
 *
 * Utilise expo-av (Video), incluse dans Expo Go SDK 54.
 * - contentFit="contain" → vidéo entière, bandes noires sur les côtés
 * - Fade-in à la première image, fade-out au noir à la fin
 * - Bouton « Passer » après 1 s
 * - Repli automatique après 4 s si la vidéo ne charge pas
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
} from 'react-native';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';

const videoSource = require('@/assets/videos/intro.mp4');

export default function StudioSplash({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();

  const rootOpacity  = useRef(new Animated.Value(1)).current;
  const videoOpacity = useRef(new Animated.Value(0)).current;
  const doneRef      = useRef(false);
  const readyRef     = useRef(false);
  const wasPlayingRef = useRef(false);
  const [showSkip, setShowSkip] = useState(false);

  // ── Fondu de sortie → onDone ──────────────────────────────────────────────
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    Animated.timing(rootOpacity, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => onDone());
  }, [rootOpacity, onDone]);

  // ── Repli : si rien ne démarre en 4 s ────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { if (!readyRef.current) finish(); }, 4000);
    return () => clearTimeout(t);
  }, [finish]);

  // ── Repli durée max (~11 s) ───────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => finish(), 11_500);
    return () => clearTimeout(t);
  }, [finish]);

  // ── Callback de statut expo-av ────────────────────────────────────────────
  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;

    // Première fois chargée → fade-in + démarrage
    if (!readyRef.current) {
      readyRef.current = true;
      Animated.timing(videoOpacity, {
        toValue: 1,
        duration: 350,
        useNativeDriver: true,
      }).start();
      setTimeout(() => setShowSkip(true), 1000);
    }

    if (status.isPlaying) {
      wasPlayingRef.current = true;
    }

    // Fin de clip détectée
    if (status.didJustFinish) {
      finish();
    }
  }, [videoOpacity, finish]);

  return (
    <Animated.View style={[styles.root, { width, height, opacity: rootOpacity }]}>
      <Animated.View style={{ opacity: videoOpacity }}>
        <Video
          source={videoSource}
          style={{ width, height }}
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
          isLooping={false}
          isMuted={false}
          onPlaybackStatusUpdate={onPlaybackStatusUpdate}
          onError={() => finish()}
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
