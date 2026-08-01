/**
 * StudioSplash — cinématique d'intro vidéo pour Forge & Kingdoms.
 *
 * - VideoView aux dimensions exactes de l'écran + contentFit="cover"
 * - useWindowDimensions → réactif aux rotations / notches
 * - Fade-in dès que le lecteur est prêt, fade-out au noir à la fin
 * - Bouton « Passer » après 1 s ; repli automatique après 4 s
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

export default function StudioSplash({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();

  const rootOpacity  = useRef(new Animated.Value(1)).current;
  const videoOpacity = useRef(new Animated.Value(0)).current;
  const doneRef      = useRef(false);
  const readyRef     = useRef(false);
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

  // ── Lecteur vidéo ─────────────────────────────────────────────────────────
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop  = false;
    p.muted = Platform.OS === 'web'; // sourdine web → contourne l'autoplay policy
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
      if (!evt.isPlaying && readyRef.current) finish();
    });

    return () => { statusSub.remove(); playingSub.remove(); };
  }, [player, videoOpacity, finish]);

  // ── Repli 4 s ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => { if (!readyRef.current) finish(); }, 4000);
    return () => clearTimeout(t);
  }, [finish]);

  return (
    /* Fond noir plein écran, toujours visible jusqu'au fade-out */
    <Animated.View
      style={[styles.root, { width, height, opacity: rootOpacity }]}
    >
      {/* Vidéo — occupe exactement l'écran, cover centre et recadre */}
      <Animated.View style={{ opacity: videoOpacity }}>
        <VideoView
          player={player}
          style={{ width, height }}
          contentFit="cover"
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
