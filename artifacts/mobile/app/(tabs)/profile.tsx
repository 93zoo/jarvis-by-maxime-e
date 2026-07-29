import React from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '@/context/GameContext';
import { useColors } from '@/hooks/useColors';
import type { SkillData, SkillType } from '@/types/game';

const SKILL_ICONS: Record<SkillType, string> = {
  forge: 'tool',
  extraction: 'zap',
  commerce: 'dollar-sign',
  construction: 'grid',
  enchantment: 'star',
  cooking: 'coffee',
  harvest: 'feather',
  combat: 'shield',
};

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const game = useGame();
  const headerTopPad = Platform.OS === 'web' ? 67 : insets.top;

  if (!game.isLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const { player } = game;
  const initials = player.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  const totalSkillLevels = Object.values(player.skills).reduce((a, b) => a + b, 0);

  const handleSave = async () => {
    await game.saveGame();
    Alert.alert('Sauvegardé', 'Votre progression a été sauvegardée.');
  };

  const handleReset = () => {
    Alert.alert(
      'Réinitialiser',
      'Toute votre progression sera perdue. Êtes-vous sûr ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Réinitialiser', style: 'destructive', onPress: game.resetGame },
      ],
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={[colors.card as string, colors.background as string]}
        style={[styles.header, { paddingTop: headerTopPad + 12 }]}
      >
        <View style={styles.headerLeft}>
          <Feather name="user" size={22} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>PROFIL</Text>
        </View>
        <TouchableOpacity
          style={[styles.saveBtn, { backgroundColor: colors.secondary }]}
          onPress={handleSave}
        >
          <Feather name="save" size={14} color={colors.accent} />
          <Text style={[styles.saveBtnText, { color: colors.accent }]}>Sauvegarder</Text>
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Player Card */}
        <LinearGradient
          colors={['#2A1A0A', '#1A0E18']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.playerCard, { borderColor: colors.border }]}
        >
          <View style={styles.playerCardTop}>
            <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
              <Text style={[styles.avatarText, { color: colors.primaryForeground }]}>
                {initials}
              </Text>
            </View>
            <View style={styles.playerInfo}>
              <Text style={[styles.playerName, { color: colors.foreground }]}>{player.name}</Text>
              <Text style={[styles.playerTitle, { color: colors.primary }]}>
                {player.forgeLevel >= 8
                  ? 'Maître Forgeron'
                  : player.forgeLevel >= 5
                  ? 'Forgeron Confirmé'
                  : player.forgeLevel >= 3
                  ? 'Forgeron'
                  : 'Apprenti Forgeron'}
              </Text>
              <Text style={[styles.playerSub, { color: colors.mutedForeground }]}>
                Forge Niveau {player.forgeLevel}
              </Text>
            </View>
            <View style={[styles.levelCircle, { borderColor: colors.primary }]}>
              <Text style={[styles.levelNumber, { color: colors.accent }]}>{player.level}</Text>
              <Text style={[styles.levelLabel, { color: colors.mutedForeground }]}>NIV</Text>
            </View>
          </View>

          {/* XP Bar */}
          <View style={styles.xpSection}>
            <View style={styles.xpLabelRow}>
              <Text style={[styles.xpLabel, { color: colors.mutedForeground }]}>
                Expérience
              </Text>
              <Text style={[styles.xpLabel, { color: colors.mutedForeground }]}>
                {player.xp}/{player.xpToNextLevel}
              </Text>
            </View>
            <View style={[styles.xpTrack, { backgroundColor: colors.muted }]}>
              <View
                style={[
                  styles.xpFill,
                  {
                    width: `${Math.min(100, Math.floor((player.xp / player.xpToNextLevel) * 100))}%` as `${number}%`,
                    backgroundColor: colors.accent,
                  },
                ]}
              />
            </View>
          </View>
        </LinearGradient>

        {/* Stats Row */}
        <View style={styles.statsGrid}>
          {[
            { label: 'Forgés', value: String(player.totalItemsCrafted), icon: 'package' },
            { label: 'Or gagné', value: player.totalGoldEarned.toLocaleString(), icon: 'dollar-sign' },
            { label: 'Niveaux skills', value: String(totalSkillLevels), icon: 'star' },
            { label: 'Or actuel', value: player.gold.toLocaleString(), icon: 'credit-card' },
          ].map((s) => (
            <View
              key={s.label}
              style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Feather name={s.icon as 'tool'} size={18} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Skills */}
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>COMPÉTENCES</Text>
        {game.allSkills.map((skill: SkillData) => {
          const currentLevel = player.skills[skill.id] ?? 1;
          const currentXP = player.skillXP[skill.id] ?? 0;
          const xpNeeded = currentLevel * 50;
          const pct = Math.min(100, Math.floor((currentXP / xpNeeded) * 100));
          const iconName = (SKILL_ICONS[skill.id] ?? 'star') as 'tool';

          return (
            <View
              key={skill.id}
              style={[styles.skillRow, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.skillIcon, { backgroundColor: `${skill.color}22` }]}>
                <Feather name={iconName} size={20} color={skill.color} />
              </View>
              <View style={styles.skillInfo}>
                <View style={styles.skillNameRow}>
                  <Text style={[styles.skillName, { color: colors.foreground }]}>{skill.name}</Text>
                  <Text style={[styles.skillLevel, { color: skill.color }]}>
                    Niv.{currentLevel}
                  </Text>
                </View>
                <View style={[styles.skillTrack, { backgroundColor: colors.muted }]}>
                  <View
                    style={[
                      styles.skillFill,
                      { width: `${pct}%` as `${number}%`, backgroundColor: skill.color },
                    ]}
                  />
                </View>
                <Text style={[styles.skillXPText, { color: colors.mutedForeground }]}>
                  {currentXP}/{xpNeeded} XP
                </Text>
              </View>
            </View>
          );
        })}

        {/* Reset button */}
        <TouchableOpacity
          style={[styles.resetBtn, { borderColor: colors.destructive }]}
          onPress={handleReset}
        >
          <Feather name="refresh-cw" size={15} color={colors.destructive} />
          <Text style={[styles.resetBtnText, { color: colors.destructive }]}>
            Réinitialiser la partie
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: 3 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 5 },
  saveBtnText: { fontSize: 12, fontWeight: '600' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  playerCard: { borderRadius: 16, padding: 20, borderWidth: 1, marginBottom: 16 },
  playerCardTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '800' },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 18, fontWeight: '700' },
  playerTitle: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  playerSub: { fontSize: 11, marginTop: 2 },
  levelCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  levelNumber: { fontSize: 20, fontWeight: '800' },
  levelLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  xpSection: {},
  xpLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  xpLabel: { fontSize: 11 },
  xpTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 3, minWidth: 4 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: {
    width: '47%',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    gap: 5,
  },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 10, letterSpacing: 0.5 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 2, marginBottom: 12 },
  skillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  skillIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  skillInfo: { flex: 1 },
  skillNameRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  skillName: { fontSize: 14, fontWeight: '600' },
  skillLevel: { fontSize: 13, fontWeight: '700' },
  skillTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  skillFill: { height: '100%', borderRadius: 3, minWidth: 4 },
  skillXPText: { fontSize: 10 },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    marginTop: 8,
  },
  resetBtnText: { fontSize: 14, fontWeight: '600' },
});
