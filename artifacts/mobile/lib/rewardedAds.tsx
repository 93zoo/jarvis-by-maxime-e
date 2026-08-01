/**
 * rewardedAds — système de publicité récompensée « jamais frustrante ».
 *
 * Règles de design :
 * - Débloqué à partir du niveau 5 du forgeron (adsUnlocked).
 * - Toujours 100 % facultatif : jamais de pub forcée ni bloquante.
 * - En Expo Go / web / dev, une pub SIMULÉE (compte à rebours) est affichée
 *   pour tester le parcours complet. En build natif de production, brancher
 *   ici un vrai SDK (AdMob) via le même contrat showRewardedAd().
 */
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useGame } from '@/context/GameContext';

export const ADS_UNLOCK_LEVEL = 5;
const SIMULATED_AD_SECONDS = 5;

export type AdPlacement = 'double_craft_reward' | 'daily_chest';

interface RewardedAdsContextValue {
  /** true dès que le forgeron a atteint le niveau 5 */
  adsUnlocked: boolean;
  /** Affiche une pub ; résout true si elle a été regardée jusqu'au bout. */
  showRewardedAd: (placement: AdPlacement) => Promise<boolean>;
}

const Ctx = createContext<RewardedAdsContextValue | null>(null);

export function RewardedAdsProvider({ children }: { children: React.ReactNode }) {
  const game = useGame();
  const adsUnlocked = game.player.level >= ADS_UNLOCK_LEVEL;

  const [visible, setVisible] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(SIMULATED_AD_SECONDS);
  const [done, setDone] = useState(false);
  const resolverRef = useRef<((watched: boolean) => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setVisible(false);
    setDone(false);
    setSecondsLeft(SIMULATED_AD_SECONDS);
  }, []);

  const finish = useCallback(
    (watched: boolean) => {
      resolverRef.current?.(watched);
      resolverRef.current = null;
      cleanup();
    },
    [cleanup],
  );

  const showRewardedAd = useCallback(
    (_placement: AdPlacement): Promise<boolean> => {
      if (!adsUnlocked) return Promise.resolve(false);
      // Garde de réentrance : une seule pub à la fois.
      if (resolverRef.current) return Promise.resolve(false);
      // NOTE: en build natif store, remplacer ce bloc par le SDK de pub réel.
      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        setSecondsLeft(SIMULATED_AD_SECONDS);
        setDone(false);
        setVisible(true);
        timerRef.current = setInterval(() => {
          setSecondsLeft((s) => {
            if (s <= 1) {
              if (timerRef.current) clearInterval(timerRef.current);
              timerRef.current = null;
              setDone(true);
              return 0;
            }
            return s - 1;
          });
        }, 1000);
      });
    },
    [adsUnlocked],
  );

  return (
    <Ctx.Provider value={{ adsUnlocked, showRewardedAd }}>
      {children}
      <Modal visible={visible} animationType="fade" statusBarTranslucent transparent={false} onRequestClose={() => finish(false)}>
        <View style={styles.adRoot}>
          <View style={styles.adBadge}>
            <Text style={styles.adBadgeText}>PUBLICITÉ SIMULÉE · MODE TEST</Text>
          </View>
          <Feather name="film" size={56} color="#E8B84B" />
          <Text style={styles.adTitle}>Votre publicité ici</Text>
          <Text style={styles.adSub}>
            {done ? 'Merci ! Récompense débloquée ✦' : `Récompense dans ${secondsLeft} s…`}
          </Text>
          {done ? (
            <TouchableOpacity
              style={styles.adBtn}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                finish(true);
              }}
            >
              <Feather name="gift" size={16} color="#1A1208" />
              <Text style={styles.adBtnText}>Récupérer ma récompense</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.adClose} onPress={() => finish(false)} hitSlop={10}>
              <Text style={styles.adCloseText}>Fermer (sans récompense)</Text>
            </TouchableOpacity>
          )}
        </View>
      </Modal>
    </Ctx.Provider>
  );
}

export function useRewardedAds() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRewardedAds must be used within RewardedAdsProvider');
  return ctx;
}

const styles = StyleSheet.create({
  adRoot: { flex: 1, backgroundColor: '#0D0A07', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  adBadge: { position: 'absolute', top: 60, backgroundColor: '#E8B84B22', borderColor: '#E8B84B55', borderWidth: 1, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  adBadgeText: { color: '#E8B84B', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  adTitle: { color: '#F5EFE2', fontSize: 20, fontWeight: '800' },
  adSub: { color: '#A99C86', fontSize: 14 },
  adBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E8B84B', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, marginTop: 8 },
  adBtnText: { color: '#1A1208', fontSize: 14, fontWeight: '800' },
  adClose: { position: 'absolute', bottom: 60 },
  adCloseText: { color: '#6B6152', fontSize: 12, textDecorationLine: 'underline' },
});
