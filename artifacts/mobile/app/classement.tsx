/**
 * Classement des joueurs — jour / semaine.
 * Points = XP forgeron + XP de forge gagnés sur la période.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGame } from '@/context/GameContext';
import {
  fetchLeaderboard,
  isLeaderboardAvailable,
  reportLeaderboardScore,
  type LeaderboardResult,
} from '@/lib/leaderboard';

const GOLD = '#E8B84B';
const NEON = '#00E5FF';
const BG = '#0D0A07';
const CARD = '#1A140D';
const PARCH = '#F5EFE2';
const DIM = '#9A8B72';
const PLAYER_ID_KEY = '@fk_player_id';

type Period = 'daily' | 'weekly';

const MEDALS = ['#FFD700', '#C0C0C0', '#CD7F32'];

export default function ClassementScreen() {
  const router = useRouter();
  const game = useGame();
  const [period, setPeriod] = useState<Period>('daily');
  const [data, setData] = useState<LeaderboardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const available = isLeaderboardAvailable();

  const load = useCallback(async (p: Period) => {
    if (!available) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(false);
    try {
      const pid = (await AsyncStorage.getItem(PLAYER_ID_KEY)) ?? '';
      // Envoyer notre score le plus récent avant de lire le classement
      if (pid) {
        await reportLeaderboardScore({
          playerId: pid,
          name: game.player.name,
          level: game.player.level,
          totalXP: (game.player.totalPlayerXPEarned ?? 0) + (game.player.totalForgeXPEarned ?? 0),
        });
      }
      const result = await fetchLeaderboard(p, pid || undefined);
      setData(result);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, game.player.name, game.player.level, game.player.totalPlayerXPEarned, game.player.totalForgeXPEarned]);

  useEffect(() => {
    load(period);
  }, [period, load]);

  const selfInTop = data?.self && data.entries.some((e) => e.playerId === data.self!.playerId);

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      {/* En-tête */}
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Feather name="award" size={22} color={NEON} />
          <Text style={styles.title}>Classement</Text>
        </View>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="x" size={24} color={PARCH} />
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>Points = XP forgeron + XP de forge gagnés sur la période</Text>

      {/* Onglets Jour / Semaine */}
      <View style={styles.tabs}>
        {(['daily', 'weekly'] as Period[]).map((p) => (
          <TouchableOpacity
            key={p}
            style={[styles.tab, period === p && styles.tabActive]}
            onPress={() => setPeriod(p)}
          >
            <Feather name={p === 'daily' ? 'sun' : 'calendar'} size={14} color={period === p ? BG : DIM} />
            <Text style={[styles.tabText, period === p && styles.tabTextActive]}>
              {p === 'daily' ? "Aujourd'hui" : 'Cette semaine'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {!available ? (
        <View style={styles.center}>
          <Feather name="wifi-off" size={36} color={DIM} />
          <Text style={styles.emptyText}>
            Le classement en ligne n'est pas disponible sur cet appareil pour le moment.
          </Text>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={NEON} size="large" />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Feather name="alert-triangle" size={36} color="#C0392B" />
          <Text style={styles.emptyText}>Impossible de charger le classement.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => load(period)}>
            <Text style={styles.retryText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      ) : !data || data.entries.length === 0 ? (
        <View style={styles.center}>
          <Feather name="users" size={36} color={DIM} />
          <Text style={styles.emptyText}>
            Personne n'a encore marqué de points {period === 'daily' ? "aujourd'hui" : 'cette semaine'}.
            {'\n'}Forge quelque chose pour prendre la tête !
          </Text>
        </View>
      ) : (
        <FlatList
          data={data.entries}
          keyExtractor={(item) => item.playerId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isSelf = data.self?.playerId === item.playerId;
            const medal = item.rank <= 3 ? MEDALS[item.rank - 1] : null;
            return (
              <View style={[styles.row, isSelf && styles.rowSelf]}>
                <View style={[styles.rankBadge, medal ? { borderColor: medal, shadowColor: medal } : null]}>
                  {medal ? (
                    <Feather name="award" size={16} color={medal} />
                  ) : (
                    <Text style={styles.rankText}>{item.rank}</Text>
                  )}
                </View>
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowName, isSelf && { color: NEON }]} numberOfLines={1}>
                    {item.name}{isSelf ? ' (toi)' : ''}
                  </Text>
                  <Text style={styles.rowLevel}>Niveau {item.level}</Text>
                </View>
                <Text style={[styles.rowPoints, medal ? { color: medal } : null]}>
                  {item.points.toLocaleString('fr-FR')} pts
                </Text>
              </View>
            );
          }}
          ListFooterComponent={
            data.self && !selfInTop ? (
              <View style={[styles.row, styles.rowSelf, { marginTop: 12 }]}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>{data.self.rank}</Text>
                </View>
                <View style={styles.rowInfo}>
                  <Text style={[styles.rowName, { color: NEON }]} numberOfLines={1}>
                    {data.self.name} (toi)
                  </Text>
                  <Text style={styles.rowLevel}>Niveau {data.self.level}</Text>
                </View>
                <Text style={styles.rowPoints}>{data.self.points.toLocaleString('fr-FR')} pts</Text>
              </View>
            ) : null
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: Platform.OS === 'web' ? 18 : 6,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { color: PARCH, fontSize: 22, fontFamily: 'Inter_700Bold' },
  subtitle: { color: DIM, fontSize: 12, fontFamily: 'Inter_400Regular', paddingHorizontal: 18, marginTop: 4 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 18, marginTop: 14, marginBottom: 6 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2117',
    backgroundColor: CARD,
  },
  tabActive: { backgroundColor: NEON, borderColor: NEON },
  tabText: { color: DIM, fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  tabTextActive: { color: BG },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 30 },
  emptyText: { color: DIM, fontSize: 14, fontFamily: 'Inter_500Medium', textAlign: 'center', lineHeight: 21 },
  retryBtn: {
    borderWidth: 1,
    borderColor: NEON,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
  },
  retryText: { color: NEON, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  list: { padding: 14, gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2117',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  rowSelf: { borderColor: NEON, shadowColor: NEON, shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 0 }, elevation: 4 },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#3A2E1E',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.35)',
    shadowOpacity: 0.6,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  rankText: { color: PARCH, fontSize: 13, fontFamily: 'Inter_700Bold' },
  rowInfo: { flex: 1 },
  rowName: { color: PARCH, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  rowLevel: { color: DIM, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 },
  rowPoints: { color: GOLD, fontSize: 15, fontFamily: 'Inter_700Bold' },
});
