/**
 * StudioSplash — cinématique d'intro vidéo pour Forge & Kingdoms.
 *
 * Utilise expo-av (Video) v16 — compatible Expo Go SDK 54.
 * - Fond noir immédiat (opacity 1 dès le montage)
 * - La vidéo joue via shouldPlay dès que le composant est monté
 * - Bouton « Passer » après 1 s
 * - Repli onError, timeout 6 s si rien ne charge, timeout 12 s max
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
} from 'react-native';
import { Video, ResizeMode, type AVPlaybackStatus } from 'expo-av';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const videoSource = require('../assets/videos/intro.mp4');

export default function StudioSplash({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();

  const rootOpacity = useRef(new Animated.Value(1)).current;
  const doneRef     = useRef(false);
  const loadedRef   = useRef(false);
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

  // Repli : rien de chargé en 6 s
  useEffect(() => {
    const t = setTimeout(() => { if (!loadedRef.current) finish(); }, 6000);
    return () => clearTimeout(t);
  }, [finish]);

  // Repli durée max 12 s
  useEffect(() => {
    const t = setTimeout(() => finish(), 12_000);
    return () => clearTimeout(t);
  }, [finish]);

  // ── Callback expo-av ──────────────────────────────────────────────────────
  const onPlaybackStatusUpdate = useCallback((status: AVPlaybackStatus) => {
    if (!status.isLoaded) return;
    if (!loadedRef.current) {
      loadedRef.current = true;
      setTimeout(() => setShowSkip(true), 1000);
    }
    if (status.didJustFinish) finish();
  }, [finish]);

  return (
    <Animated.View style={[styles.root, { width, height, opacity: rootOpacity }]}>
      <Video
        source={videoSource}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay
        isLooping={false}
        isMuted={false}
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
        onError={() => finish()}
      />

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
