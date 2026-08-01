/**
 * StudioSplash — cinématique d'intro vidéo pour Forge & Kingdoms.
 *
 * Flux :
 *   Fond noir immédiat → fade-in vidéo dès que le lecteur est prêt →
 *   fade-out au noir à la fin → onDone()
 *
 * Web : vidéo démarrée en sourdine pour contourner la politique autoplay.
 * Repli : si rien ne démarre en 4 s, onDone() est appelé directement.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

const videoSource = require('@/assets/videos/intro.mp4');

export default function StudioSplash({ onDone }: { onDone: () => void }) {
  // Le fond noir est toujours visible (opacity 1).
  // Seule la vidéo fait un fade-in séparé.
  const videoOpacity = useRef(new Animated.Value(0)).current;
  const rootOpacity  = useRef(new Animated.Value(1)).current;

  const doneRef  = useRef(false);
  const readyRef = useRef(false);
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

  // ── Créer le lecteur ──────────────────────────────────────────────────────
  const player = useVideoPlayer(videoSource, (p) => {
    p.loop  = false;
    // Sur web : mute pour contourner la politique autoplay des navigateurs
    p.muted = Platform.OS === 'web';
  });

  // ── Écoute les changements de statut ──────────────────────────────────────
  useEffect(() => {
    const statusSub = player.addListener('statusChange', (evt) => {
      if (evt.status === 'readyToPlay' && !readyRef.current) {
        readyRef.current = true;

        // Lance la lecture, puis fait apparaître la vidéo
        try { player.play(); } catch (_) {}

        Animated.timing(videoOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();

        // Bouton « Passer » visible après 1 s
        setTimeout(() => setShowSkip(true), 1000);
      }
    });

    // isPlaying passe à false en fin de clip (après avoir été true)
    const playingSub = player.addListener('playingChange', (evt) => {
      if (!evt.isPlaying && readyRef.current) {
        finish();
      }
    });

    return () => {
      statusSub.remove();
      playingSub.remove();
    };
  }, [player, videoOpacity, finish]);

  // ── Repli : si la vidéo ne démarre pas en 4 s, on passe ──────────────────
  useEffect(() => {
    const t = setTimeout(() => {
      if (!readyRef.current) finish();
    }, 4000);
    return () => clearTimeout(t);
  }, [finish]);

  return (
    <Animated.View style={[styles.root, { opacity: rootOpacity }]}>
      {/* Fond noir permanent */}

      {/* Vidéo avec fade-in */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: videoOpacity }]}>
        <VideoView
          player={player}
          style={styles.video}
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
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
    zIndex: 9999,
    elevation: 9999,
    overflow: 'hidden',
  },
  video: {
    ...StyleSheet.absoluteFillObject,
  },
  skipBtn: {
    position: 'absolute',
    bottom: 40,
    right: 24,
    paddingHorizontal: 18,
    paddingVertical: 9,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(232,184,75,0.35)',
  },
  skipText: {
    color: 'rgba(232,184,75,0.85)',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1.5,
  },
});
