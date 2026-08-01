/**
 * DailyRewardModal — récompense de connexion quotidienne (cycle de 7 jours).
 * S'affiche automatiquement une fois par jour ; la série (streak) se brise si
 * un jour est manqué. Récompenses créditées AVANT le marquage du jour
 * (jamais de perte en cas de crash).
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useGame } from '@/context/GameContext';
import { STUDIO } from '@/constants/studio';

const STATE_KEY = '@fk_daily_login_v1';

interface DailyState {
  lastClaimDay: string; // "YYYY-M-D"
  streak: number; // 1..7 (jour réclamé le plus récent dans le cycle)
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function isYesterday(prevKey: string, now: Date): boolean {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return prevKey === dayKey(y);
}

interface Reward {
  label: string;
  gold?: number;
  resources?: Array<{ id: string; qty: number; name: string }>;
}

function rewardForDay(day: number, level: number): Reward {
  switch (day) {
    case 1: return { label: `${100 + level * 20} or`, gold: 100 + level * 20 };
    case 2: return { label: '5 charbon + 3 acier', resources: [{ id: 'coal', qty: 5, name: 'charbon' }, { id: 'steel', qty: 3, name: 'acier' }] };
    case 3: return { label: `${200 + level * 25} or`, gold: 200 + level * 25 };
    case 4: return { label: '2 cristal + 2 argent', resources: [{ id: 'crystal', qty: 2, name: 'cristal' }, { id: 'silver', qty: 2, name: 'argent' }] };
    case 5: return { label: `${300 + level * 35} or`, gold: 300 + level * 35 };
    case 6: return { label: '2 rubis + 2 saphir', resources: [{ id: 'ruby', qty: 2, name: 'rubis' }, { id: 'sapphire', qty: 2, name: 'saphir' }] };
    default: return {
      label: `${500 + level * 50} or + 1 diamant + 1 mithril`,
      gold: 500 + level * 50,
      resources: [{ id: 'diamond', qty: 1, name: 'diamant' }, { id: 'mithril', qty: 1, name: 'mithril' }],
    };
  }
}

export default function DailyRewardModal() {
  const game = useGame();
  const [visible, setVisible] = useState(false);
  const [pendingDay, setPendingDay] = useState(1);
  const [claimed, setClaimed] = useState(false);
  const busyRef = useRef(false);

  const burst = useRef(new Animated.Value(0)).current;
  const chestScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STATE_KEY);
        const now = new Date();
        const today = dayKey(now);
        if (!raw) {
          setPendingDay(1);
          setVisible(true);
          return;
        }
        const st = JSON.parse(raw) as DailyState;
        if (st.lastClaimDay === today) return; // déjà réclamé aujourd'hui
        const nextDay = isYesterday(st.lastClaimDay, now) ? (st.streak % 7) + 1 : 1;
        setPendingDay(nextDay);
        setVisible(true);
      } catch {
        // silencieux : la récompense réapparaîtra au prochain lancement
      }
    })();
  }, []);

  const claim = async () => {
    if (busyRef.current || claimed) return;
    busyRef.current = true;
    try {
      const reward = rewardForDay(pendingDay, game.player.level);
      // Créditer d'abord…
      if (reward.gold) game.addGold(reward.gold);
      reward.resources?.forEach((r) => game.addResource(r.id, r.qty));
      // …puis marquer le jour.
      const st: DailyState = { lastClaimDay: dayKey(new Date()), streak: pendingDay };
      await AsyncStorage.setItem(STATE_KEY, JSON.stringify(st));
      setClaimed(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Animated.parallel([
        Animated.sequence([
          Animated.timing(chestScale, { toValue: 1.35, duration: 180, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
          Animated.timing(chestScale, { toValue: 1, duration: 220, useNativeDriver: true }),
        ]),
        Animated.timing(burst, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
      setTimeout(() => setVisible(false), 1600);
    } finally {
      busyRef.current = false;
    }
  };

  const reward = rewardForDay(pendingDay, game.player.level);
  const burstScale = burst.interpolate({ inputRange: [0, 1], outputRange: [0.3, 2.4] });
  const burstOpacity = burst.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.8, 0] });

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setVisible(false)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.kicker}>RÉCOMPENSE QUOTIDIENNE</Text>
          <Text style={styles.title}>Jour {pendingDay} / 7</Text>

          {/* Piste des 7 jours */}
          <View style={styles.track}>
            {Array.from({ length: 7 }, (_, i) => i + 1).map((d) => (
              <View
                key={d}
                style={[
                  styles.dayDot,
                  d < pendingDay && styles.dayDone,
                  d === pendingDay && styles.dayCurrent,
                ]}
              >
                <Text style={[styles.dayDotText, d === pendingDay && { color: '#1A1208' }]}>{d}</Text>
              </View>
            ))}
          </View>

          <View style={styles.chestWrap}>
            <Animated.View style={[styles.burst, { opacity: burstOpacity, transform: [{ scale: burstScale }] }]} />
            <Animated.View style={{ transform: [{ scale: chestScale }] }}>
              <Feather name="gift" size={52} color={STUDIO.gold} />
            </Animated.View>
          </View>

          <Text style={styles.rewardText}>{claimed ? 'Récompense récupérée ✦' : reward.label}</Text>

          {!claimed && (
            <TouchableOpacity style={styles.claimBtn} onPress={claim} activeOpacity={0.85}>
              <Text style={styles.claimBtnText}>RÉCUPÉRER</Text>
            </TouchableOpacity>
          )}
          {!claimed && (
            <TouchableOpacity onPress={() => setVisible(false)} hitSlop={10}>
              <Text style={styles.later}>Plus tard</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#000000CC', alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: { width: '100%', backgroundColor: '#171208', borderColor: STUDIO.goldDim, borderWidth: 1, borderRadius: 18, padding: 22, alignItems: 'center', gap: 12 },
  kicker: { color: STUDIO.gold, fontSize: 10, fontWeight: '800', letterSpacing: 2.5 },
  title: { color: STUDIO.parchment, fontSize: 20, fontWeight: '900' },
  track: { flexDirection: 'row', gap: 6, marginVertical: 4 },
  dayDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: '#3A2F1E', alignItems: 'center', justifyContent: 'center' },
  dayDone: { backgroundColor: STUDIO.goldDim + '55', borderColor: STUDIO.goldDim },
  dayCurrent: { backgroundColor: STUDIO.gold, borderColor: STUDIO.gold },
  dayDotText: { color: '#A99C86', fontSize: 11, fontWeight: '800' },
  chestWrap: { alignItems: 'center', justifyContent: 'center', height: 90, width: 90 },
  burst: { position: 'absolute', width: 70, height: 70, borderRadius: 35, backgroundColor: STUDIO.gold },
  rewardText: { color: STUDIO.parchment, fontSize: 15, fontWeight: '700', textAlign: 'center' },
  claimBtn: { backgroundColor: STUDIO.gold, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 36, marginTop: 4 },
  claimBtnText: { color: '#1A1208', fontSize: 14, fontWeight: '900', letterSpacing: 1.5 },
  later: { color: '#6B6152', fontSize: 12, textDecorationLine: 'underline', marginTop: 2 },
});
