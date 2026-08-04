/**
 * Récompenses du classement (top 3 quotidien / hebdomadaire).
 *
 * Au lancement du jeu, vérifie auprès du serveur si le joueur a gagné des
 * récompenses non réclamées et les affiche dans une fenêtre. La réclamation
 * est confirmée côté serveur (une seule fois) avant de créditer l'or et les
 * matériaux dans la partie.
 */
import React, { useEffect, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGame } from '@/context/GameContext';
import {
  claimLeaderboardReward,
  fetchLeaderboardRewards,
  isLeaderboardAvailable,
  type LeaderboardAward,
} from '@/lib/leaderboard';
const PLAYER_ID_KEY = '@fk_player_id';
const GOLD = '#E8B84B';
const BG = '#0D0A07';
const CARD = '#1A140D';
const PARCH = '#F5EFE2';
const DIM = '#9A8B72';
const MEDALS = ['#FFD700', '#C0C0C0', '#CD7F32'];

let _resourceNames: Record<string, string> | undefined;
function getResourceNames(): Record<string, string> {
  if (!_resourceNames) {
    const data = require('@/data/resources.json') as { id: string; name?: string }[];
    _resourceNames = Object.fromEntries(data.map((r) => [r.id, r.name ?? r.id]));
  }
  return _resourceNames;
}

function materialLabel(m: { id: string; qty: number }): string {
  return `${m.qty}× ${getResourceNames()[m.id] ?? m.id}`;
}

function periodLabel(a: LeaderboardAward): string {
  return a.period === 'daily'
    ? `Classement du ${a.periodKey}`
    : `Classement de la semaine ${a.periodKey.split('-W')[1] ?? a.periodKey}`;
}

export default function LeaderboardRewardsModal() {
  const game = useGame();
  const [awards, setAwards] = useState<LeaderboardAward[]>([]);
  const [visible, setVisible] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [claimedIds, setClaimedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!game.isLoaded || !isLeaderboardAvailable()) return;
    let cancelled = false;
    (async () => {
      try {
        const pid = (await AsyncStorage.getItem(PLAYER_ID_KEY)) ?? '';
        if (!pid) return;
        const { pending } = await fetchLeaderboardRewards(pid);
        if (!cancelled && pending.length > 0) {
          setAwards(pending);
          setVisible(true);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch {
        // best effort : on réessaiera au prochain lancement
      }
    })();
    return () => {
      cancelled = true;
    };
    // Vérification unique au chargement de la partie
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.isLoaded]);

  const claim = async (award: LeaderboardAward) => {
    if (busyId || claimedIds.has(award.id)) return;
    setBusyId(award.id);
    try {
      const pid = (await AsyncStorage.getItem(PLAYER_ID_KEY)) ?? '';
      const confirmed = await claimLeaderboardReward(pid, award.id);
      if (confirmed) {
        if (confirmed.gold > 0) game.addGold(confirmed.gold);
        for (const m of confirmed.materials ?? []) {
          if (m.qty > 0) game.addResource(m.id, m.qty);
        }
        setClaimedIds((prev) => new Set(prev).add(award.id));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        // Déjà réclamée ailleurs ou serveur injoignable : on la retire sans créditer.
        setClaimedIds((prev) => new Set(prev).add(award.id));
      }
    } finally {
      setBusyId(null);
    }
  };

  if (!visible || awards.length === 0) return null;

  const allClaimed = awards.every((a) => claimedIds.has(a.id));

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => setVisible(false)}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Feather name="award" size={22} color={GOLD} />
            <Text style={styles.title}>Tu es sur le podium !</Text>
          </View>
          <Text style={styles.subtitle}>
            Tes exploits au classement t'ont rapporté des récompenses.
          </Text>

          <ScrollView style={{ maxHeight: 340 }} contentContainerStyle={{ gap: 10 }}>
            {awards.map((a) => {
              const claimed = claimedIds.has(a.id);
              const medal = MEDALS[Math.min(a.rank, 3) - 1];
              return (
                <View key={a.id} style={styles.awardRow}>
                  <View style={[styles.medal, { borderColor: medal }]}>
                    <Text style={[styles.medalText, { color: medal }]}>#{a.rank}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.awardTitle}>{a.title}</Text>
                    <Text style={styles.awardPeriod}>{periodLabel(a)}</Text>
                    <Text style={styles.awardLoot}>
                      {[`${a.gold.toLocaleString('fr-FR')} or`, ...(a.materials ?? []).map(materialLabel)].join(' · ')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.claimBtn, claimed && styles.claimBtnDone]}
                    disabled={claimed || busyId !== null}
                    onPress={() => claim(a)}
                  >
                    {claimed ? (
                      <Feather name="check" size={16} color={DIM} />
                    ) : (
                      <Text style={styles.claimText}>{busyId === a.id ? '…' : 'Réclamer'}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>

          <TouchableOpacity style={styles.closeBtn} onPress={() => setVisible(false)}>
            <Text style={styles.closeText}>{allClaimed ? 'Fermer' : 'Plus tard'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: BG,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GOLD,
    padding: 18,
    gap: 10,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: PARCH, fontSize: 19, fontFamily: 'Inter_700Bold' },
  subtitle: { color: DIM, fontSize: 13, fontFamily: 'Inter_400Regular', marginBottom: 4 },
  awardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2117',
    padding: 12,
  },
  medal: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  medalText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  awardTitle: { color: PARCH, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  awardPeriod: { color: DIM, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 1 },
  awardLoot: { color: GOLD, fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 3 },
  claimBtn: {
    backgroundColor: GOLD,
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    minWidth: 44,
    alignItems: 'center',
  },
  claimBtnDone: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#2A2117' },
  claimText: { color: '#1A1208', fontSize: 13, fontFamily: 'Inter_700Bold' },
  closeBtn: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 20, marginTop: 2 },
  closeText: { color: DIM, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
});
