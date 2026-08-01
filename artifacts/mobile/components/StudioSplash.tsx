/**
 * StudioSplash — cinématique d'intro vidéo pour Forge & Kingdoms.
 *
 * - contentFit="contain" → vidéo entière, bandes noires sur les côtés
 * - Fade-in dès readyToPlay, fade-out au noir en fin de clip
 * - Bouton « Passer » après 1 s
 * - Fallback : si le lecteur ne démarre pas en 4 s → skip
 * - Garde contre playingChange(false) prématuré : on attend que
 *   la vidéo ait vraiment joué avant de considérer une "fin de clip"
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
import { useVideoPlayer, VideoView } from 'expo-video';

const videoSource = require('@/assets/videos/intro.mp4');
const VIDEO_DURATION_MS = 10_200; // ~10 s + marge

export default function StudioSplash({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();

  const rootOpacity  = useRef(new Animated.Value(1)).current;
  const videoOpacity = useRef(new Animated.Value(0)).current;

  const doneRef       = useRef(false);
  const readyRef      = useRef(false);
  const wasPlayingRef = useRef(false); // true dès le premier frame joué
  const [showSkip, setShowSkip] = useState(false);

  // ── Fondu de sortie ───────────────────────────────────────────────────────
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    Animated.timing(rootOpacity, {
      toValue: 0,
      duration: 400,
      useNativeDriver: true,
    }).start(() => onDone());
  }, [rootOpacity, onDone]);

  // ── Lecteur ───────────────────────────────────────────────────────────────
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop  = false;
    p.muted = Platform.OS === 'web';
  });

  // ── Événements ────────────────────────────────────────────────────────────
  useEffect(() => {
    const statusSub = player.addListener('statusChange', (evt) => {
      if (evt.status === 'readyToPlay' && !readyRef.current) {
        readyRef.current = true;
        try { player.play(); } catch (_) {}

        Animated.timing(videoOpacity, {
          toValue: 1,
          duration: 350,
          useNativeDriver: true,
        }).start();

        setTimeout(() => setShowSkip(true), 1000);
      }
    });

    const playingSub = player.addListener('playingChange', (evt) => {
      if (evt.isPlaying) {
        // La vidéo joue réellement — on note le fait
        wasPlayingRef.current = true;
      } else if (wasPlayingRef.current) {
        // La vidéo s'était lancée et vient de s'arrêter → fin du clip
        finish();
      }
      // Si isPlaying=false avant que la vidéo ait joué (état initial), on ignore
    });

    return () => { statusSub.remove(); playingSub.remove(); };
  }, [player, videoOpacity, finish]);

  // ── Fallback : pas de démarrage après 4 s ─────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { if (!readyRef.current) finish(); }, 4000);
    return () => clearTimeout(t);
  }, [finish]);

  // ── Fallback : durée maximale (évite un clip bloqué) ──────────────────────
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
