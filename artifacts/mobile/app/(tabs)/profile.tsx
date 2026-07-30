import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useGame } from '@/context/GameContext';
import { useColors } from '@/hooks/useColors';
import type { SkillData, SkillType, TalentData } from '@/types/game';

// ─── Constants ───────────────────────────────────────────────────────────────
const SKILL_ICONS: Record<SkillType, string> = {
  forge: 'tool', extraction: 'zap', commerce: 'dollar-sign',
  construction: 'grid', enchantment: 'star', cooking: 'coffee',
  harvest: 'feather', combat: 'shield',
};

type TreeKey = 'forge' | 'extraction' | 'commerce' | 'construction' | 'universal';

const TREE_INFO: Record<TreeKey, { label: string; icon: string; color: string }> = {
  forge:        { label: 'Forge',        icon: 'tool',        color: '#D4851A' },
  extraction:   { label: 'Extraction',   icon: 'zap',         color: '#7A7A8C' },
  commerce:     { label: 'Commerce',     icon: 'dollar-sign', color: '#D4AF37' },
  construction: { label: 'Construction', icon: 'grid',        color: '#8B6B3D' },
  universal:    { label: 'Universel',    icon: 'sun',         color: '#9966CC' },
};

// Talent tree layout constants
const NODE_R = 26;
const COL0_X = 70;
const COL1_X = 190;
const TIER0_Y = 70;
const TIER_STEP = 110;
const CANVAS_W = 280;
const CANVAS_H = TIER0_Y + 4 * TIER_STEP + NODE_R + 40;

function nodePosForTalent(t: TalentData) {
  return {
    x: t.col === 0 ? COL0_X : COL1_X,
    y: TIER0_Y + t.tier * TIER_STEP,
  };
}

// ─── Connection Line ──────────────────────────────────────────────────────────
function ConnectionLine({
  x1, y1, x2, y2, color,
}: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: (x1 + x2) / 2 - length / 2,
        top: (y1 + y2) / 2 - 1,
        width: length,
        height: 2,
        backgroundColor: color,
        opacity: 0.45,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

// ─── Talent Node ──────────────────────────────────────────────────────────────
function TalentNode({
  talent, unlocked, available, selected, treeColor, onPress,
}: {
  talent: TalentData; unlocked: boolean; available: boolean;
  selected: boolean; treeColor: string; onPress: () => void;
}) {
  const { x, y } = nodePosForTalent(talent);
  const bg = unlocked ? treeColor : available ? '#0A0810' : '#12101A';
  const border = unlocked ? treeColor : available ? treeColor : '#2A2840';
  const opacity = unlocked ? 1 : available ? 0.9 : 0.4;
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={{
        position: 'absolute',
        left: x - NODE_R,
        top: y - NODE_R,
        width: NODE_R * 2,
        height: NODE_R * 2,
        borderRadius: NODE_R,
        backgroundColor: bg,
        borderWidth: selected ? 3 : 2,
        borderColor: selected ? '#fff' : border,
        opacity,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Feather
        name={talent.icon as 'tool'}
        size={14}
        color={unlocked ? '#fff' : available ? treeColor : '#3A3860'}
      />
    </TouchableOpacity>
  );
}

// ─── Talent Tree View ─────────────────────────────────────────────────────────
function TalentTreeView({
  treeKey, game, colors,
}: {
  treeKey: TreeKey;
  game: ReturnType<typeof useGame>;
  colors: ReturnType<typeof useColors>;
}) {
  const [selectedTalentId, setSelectedTalentId] = useState<string | null>(null);
  const treeTalents = useMemo(
    () => game.allTalents.filter((t) => t.tree === treeKey),
    [game.allTalents, treeKey],
  );
  const info = TREE_INFO[treeKey];
  const unlocked = game.player.talentsUnlocked;
  const skillLevels = game.player.skills;

  const isTalentUnlocked = (id: string) => unlocked.includes(id);
  const isTalentAvailable = (t: TalentData) => {
    if (isTalentUnlocked(t.id)) return false;
    if (game.player.talentPoints < t.cost) return false;
    if (t.requiredSkill && (skillLevels[t.requiredSkill] ?? 0) < t.requiredSkillLevel) return false;
    if (!t.requiredSkill) {
      const maxLevel = Math.max(...Object.values(skillLevels));
      if (maxLevel < t.requiredSkillLevel) return false;
    }
    return t.prerequisiteIds.every((pid) => isTalentUnlocked(pid));
  };

  const selectedTalent = treeTalents.find((t) => t.id === selectedTalentId) ?? null;

  const handleUnlock = () => {
    if (!selectedTalent) return;
    const ok = game.unlockTalent(selectedTalent.id);
    if (ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelectedTalentId(null);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  return (
    <View>
      {/* Canvas */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: 16 }}
        contentContainerStyle={{ justifyContent: 'center' }}
      >
        <View style={{ width: CANVAS_W, height: CANVAS_H }}>
          {/* Connection lines */}
          {treeTalents.map((t) => {
            const toPos = nodePosForTalent(t);
            return t.prerequisiteIds.map((pid) => {
              const prereq = treeTalents.find((x) => x.id === pid);
              if (!prereq) return null;
              const fromPos = nodePosForTalent(prereq);
              const isLit = isTalentUnlocked(t.id) && isTalentUnlocked(pid);
              return (
                <ConnectionLine
                  key={`${pid}-${t.id}`}
                  x1={fromPos.x} y1={fromPos.y}
                  x2={toPos.x} y2={toPos.y}
                  color={isLit ? info.color : '#2A2840'}
                />
              );
            });
          })}
          {/* Nodes */}
          {treeTalents.map((t) => (
            <TalentNode
              key={t.id}
              talent={t}
              unlocked={isTalentUnlocked(t.id)}
              available={isTalentAvailable(t)}
              selected={selectedTalentId === t.id}
              treeColor={info.color}
              onPress={() => setSelectedTalentId(selectedTalentId === t.id ? null : t.id)}
            />
          ))}
        </View>
      </ScrollView>

      {/* Selected talent detail */}
      {selectedTalent ? (
        <View style={[tStyles.detail, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={tStyles.detailTop}>
            <View style={[tStyles.detailIcon, { backgroundColor: `${info.color}22` }]}>
              <Feather name={selectedTalent.icon as 'tool'} size={20} color={info.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[tStyles.detailName, { color: colors.foreground }]}>{selectedTalent.name}</Text>
              <Text style={[tStyles.detailDesc, { color: colors.mutedForeground }]}>{selectedTalent.description}</Text>
            </View>
            <View style={[tStyles.costBadge, { backgroundColor: colors.secondary }]}>
              <Text style={[tStyles.costText, { color: info.color }]}>{selectedTalent.cost} pt</Text>
            </View>
          </View>
          {selectedTalent.requiredSkill && (
            <Text style={[tStyles.reqText, { color: colors.mutedForeground }]}>
              Requis : {selectedTalent.requiredSkill} Niv.{selectedTalent.requiredSkillLevel}
              {' '}— votre niveau : {skillLevels[selectedTalent.requiredSkill] ?? 0}
            </Text>
          )}
          {selectedTalent.prerequisiteIds.length > 0 && (
            <Text style={[tStyles.reqText, { color: colors.mutedForeground }]}>
              Prérequis : {selectedTalent.prerequisiteIds.map((id) => {
                const t = game.allTalents.find((x) => x.id === id);
                return (isTalentUnlocked(id) ? '✅ ' : '❌ ') + (t?.name ?? id);
              }).join(', ')}
            </Text>
          )}
          {isTalentUnlocked(selectedTalent.id) ? (
            <View style={[tStyles.unlockedBadge, { backgroundColor: `${info.color}22` }]}>
              <Text style={[tStyles.unlockedText, { color: info.color }]}>✓ Déjà débloqué</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                tStyles.unlockBtn,
                {
                  backgroundColor: isTalentAvailable(selectedTalent) ? info.color : colors.muted,
                  opacity: isTalentAvailable(selectedTalent) ? 1 : 0.5,
                },
              ]}
              onPress={handleUnlock}
              disabled={!isTalentAvailable(selectedTalent)}
            >
              <Text style={[tStyles.unlockBtnText, { color: isTalentAvailable(selectedTalent) ? '#fff' : colors.mutedForeground }]}>
                Débloquer ({selectedTalent.cost} point{selectedTalent.cost > 1 ? 's' : ''})
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={[tStyles.detail, tStyles.detailEmpty, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Text style={[tStyles.detailEmptyText, { color: colors.mutedForeground }]}>
            Touchez un talent pour voir ses détails
          </Text>
        </View>
      )}
    </View>
  );
}

const tStyles = StyleSheet.create({
  detail: { borderRadius: 14, padding: 14, marginHorizontal: 16, borderWidth: 1, marginTop: 8 },
  detailTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  detailIcon: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  detailName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  detailDesc: { fontSize: 12, lineHeight: 17 },
  costBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  costText: { fontSize: 13, fontWeight: '700' },
  reqText: { fontSize: 11, marginBottom: 6, lineHeight: 16 },
  unlockedBadge: { paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  unlockedText: { fontSize: 13, fontWeight: '700' },
  unlockBtn: { paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  unlockBtnText: { fontSize: 14, fontWeight: '700' },
  detailEmpty: { alignItems: 'center', paddingVertical: 18 },
  detailEmptyText: { fontSize: 12 },
});

// ─── Skill Detail Modal ───────────────────────────────────────────────────────
function SkillDetailModal({
  skill, level, xp, onClose, colors,
}: {
  skill: SkillData | null;
  level: number;
  xp: number;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  if (!skill) return null;
  const xpNeeded = level * 50;
  const pct = Math.min(100, Math.floor((xp / xpNeeded) * 100));
  return (
    <Modal visible={!!skill} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={sdStyles.overlay}>
        <View style={[sdStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[sdStyles.handle, { backgroundColor: colors.muted }]} />
          <View style={sdStyles.header}>
            <View style={[sdStyles.iconBg, { backgroundColor: `${skill.color}22` }]}>
              <Feather name={(SKILL_ICONS[skill.id] ?? 'star') as 'tool'} size={22} color={skill.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[sdStyles.skillName, { color: colors.foreground }]}>{skill.name}</Text>
              <Text style={[sdStyles.skillDesc, { color: colors.mutedForeground }]}>{skill.description}</Text>
            </View>
            <View style={[sdStyles.levelBadge, { borderColor: skill.color }]}>
              <Text style={[sdStyles.levelNum, { color: skill.color }]}>{level}</Text>
              <Text style={[sdStyles.levelLbl, { color: colors.mutedForeground }]}>NIV</Text>
            </View>
          </View>

          <View style={[sdStyles.xpBar, { backgroundColor: colors.muted }]}>
            <View style={[sdStyles.xpFill, { width: `${pct}%` as `${number}%`, backgroundColor: skill.color }]} />
          </View>
          <Text style={[sdStyles.xpText, { color: colors.mutedForeground }]}>{xp} / {xpNeeded} XP</Text>

          <Text style={[sdStyles.unlocksTitle, { color: colors.foreground }]}>PALIERS DE MAÎTRISE</Text>
          <ScrollView style={sdStyles.unlockList} showsVerticalScrollIndicator={false}>
            {skill.unlocks.map((u) => {
              const isReached = level >= u.level;
              return (
                <View key={u.level} style={[sdStyles.unlockRow, { opacity: isReached ? 1 : 0.5 }]}>
                  <View style={[sdStyles.unlockDot, { backgroundColor: isReached ? skill.color : colors.muted }]}>
                    {isReached && <Feather name="check" size={10} color="#fff" />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[sdStyles.unlockLevel, { color: isReached ? skill.color : colors.mutedForeground }]}>
                      Niveau {u.level}
                    </Text>
                    <Text style={[sdStyles.unlockReward, { color: colors.foreground }]}>{u.reward}</Text>
                  </View>
                </View>
              );
            })}
            <View style={{ height: 20 }} />
          </ScrollView>

          <TouchableOpacity style={[sdStyles.closeBtn, { backgroundColor: colors.secondary }]} onPress={onClose}>
            <Text style={[sdStyles.closeBtnText, { color: colors.foreground }]}>Fermer</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const sdStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1, borderBottomWidth: 0 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  iconBg: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  skillName: { fontSize: 18, fontWeight: '700' },
  skillDesc: { fontSize: 12, marginTop: 2, lineHeight: 16 },
  levelBadge: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  levelNum: { fontSize: 20, fontWeight: '800' },
  levelLbl: { fontSize: 9, fontWeight: '600', letterSpacing: 1 },
  xpBar: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 6 },
  xpFill: { height: '100%', borderRadius: 4 },
  xpText: { fontSize: 11, textAlign: 'right', marginBottom: 16 },
  unlocksTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 10 },
  unlockList: { flex: 1 },
  unlockRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  unlockDot: { width: 18, height: 18, borderRadius: 9, justifyContent: 'center', alignItems: 'center', marginTop: 1 },
  unlockLevel: { fontSize: 11, fontWeight: '700', marginBottom: 1 },
  unlockReward: { fontSize: 13 },
  closeBtn: { marginTop: 14, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  closeBtnText: { fontSize: 15, fontWeight: '700' },
});

// ─── Main Profile Screen ──────────────────────────────────────────────────────
export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const game = useGame();
  const headerTopPad = Platform.OS === 'web' ? 67 : insets.top;
  const [activeTab, setActiveTab] = useState<'skills' | 'talents' | 'stats'>('skills');
  const [selectedSkillId, setSelectedSkillId] = useState<SkillType | null>(null);
  const [selectedTree, setSelectedTree] = useState<TreeKey>('forge');

  if (!game.isLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const { player } = game;
  const initials = player.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
  const totalSkillLevels = Object.values(player.skills).reduce((a, b) => a + b, 0);
  const selectedSkill = selectedSkillId ? game.allSkills.find((s) => s.id === selectedSkillId) ?? null : null;

  const handleSave = async () => {
    await game.saveGame();
    Alert.alert('Sauvegardé', 'Votre progression a été sauvegardée.');
  };
  const handleReset = () => {
    Alert.alert('Réinitialiser', 'Toute votre progression sera perdue. Êtes-vous sûr ?', [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Réinitialiser', style: 'destructive', onPress: game.resetGame },
    ]);
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
          {player.talentPoints > 0 && (
            <View style={[styles.tpBadge, { backgroundColor: '#9966CC' }]}>
              <Text style={styles.tpBadgeText}>{player.talentPoints} pt</Text>
            </View>
          )}
        </View>
        <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.secondary }]} onPress={handleSave}>
          <Feather name="save" size={14} color={colors.accent} />
          <Text style={[styles.saveBtnText, { color: colors.accent }]}>Sauvegarder</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Player card */}
      <LinearGradient
        colors={['#2A1A0A', '#1A0E18']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.playerCard, { borderColor: colors.border }]}
      >
        <View style={styles.playerCardTop}>
          <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
            <Text style={[styles.avatarText, { color: colors.primaryForeground }]}>{initials}</Text>
          </View>
          <View style={styles.playerInfo}>
            <Text style={[styles.playerName, { color: colors.foreground }]}>{player.name}</Text>
            <Text style={[styles.playerTitle, { color: colors.primary }]}>
              {player.forgeLevel >= 8 ? 'Maître Forgeron' : player.forgeLevel >= 5 ? 'Forgeron Confirmé' : player.forgeLevel >= 3 ? 'Forgeron' : 'Apprenti Forgeron'}
            </Text>
            <Text style={[styles.playerSub, { color: colors.mutedForeground }]}>Forge Niveau {player.forgeLevel} · {player.talentPoints} pt talents</Text>
          </View>
          <View style={[styles.levelCircle, { borderColor: colors.primary }]}>
            <Text style={[styles.levelNumber, { color: colors.accent }]}>{player.level}</Text>
            <Text style={[styles.levelLabel, { color: colors.mutedForeground }]}>NIV</Text>
          </View>
        </View>
        <View style={styles.xpSection}>
          <View style={styles.xpLabelRow}>
            <Text style={[styles.xpLabel, { color: colors.mutedForeground }]}>Expérience</Text>
            <Text style={[styles.xpLabel, { color: colors.mutedForeground }]}>{player.xp}/{player.xpToNextLevel}</Text>
          </View>
          <View style={[styles.xpTrack, { backgroundColor: colors.muted }]}>
            <View style={[styles.xpFill, { width: `${Math.min(100, Math.floor((player.xp / player.xpToNextLevel) * 100))}%` as `${number}%`, backgroundColor: colors.accent }]} />
          </View>
        </View>
      </LinearGradient>

      {/* Tab bar */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        {(['skills', 'talents', 'stats'] as const).map((tab) => {
          const labels = { skills: 'Compétences', talents: 'Talents', stats: 'Statistiques' };
          return (
            <TouchableOpacity
              key={tab}
              style={[styles.tabPill, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.mutedForeground }]}>
                {labels[tab]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Tab content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Skills tab ── */}
        {activeTab === 'skills' && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>COMPÉTENCES</Text>
            {game.allSkills.map((skill: SkillData) => {
              const currentLevel = player.skills[skill.id] ?? 1;
              const currentXP = player.skillXP[skill.id] ?? 0;
              const xpNeeded = currentLevel * 50;
              const pct = Math.min(100, Math.floor((currentXP / xpNeeded) * 100));
              const iconName = (SKILL_ICONS[skill.id] ?? 'star') as 'tool';
              const nextUnlock = skill.unlocks.find((u) => u.level > currentLevel);
              return (
                <TouchableOpacity
                  key={skill.id}
                  activeOpacity={0.8}
                  style={[styles.skillRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                  onPress={() => { setSelectedSkillId(skill.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                >
                  <View style={[styles.skillIcon, { backgroundColor: `${skill.color}22` }]}>
                    <Feather name={iconName} size={20} color={skill.color} />
                  </View>
                  <View style={styles.skillInfo}>
                    <View style={styles.skillNameRow}>
                      <Text style={[styles.skillName, { color: colors.foreground }]}>{skill.name}</Text>
                      <Text style={[styles.skillLevel, { color: skill.color }]}>Niv.{currentLevel}</Text>
                    </View>
                    <View style={[styles.skillTrack, { backgroundColor: colors.muted }]}>
                      <View style={[styles.skillFill, { width: `${pct}%` as `${number}%`, backgroundColor: skill.color }]} />
                    </View>
                    <View style={styles.skillFooter}>
                      <Text style={[styles.skillXPText, { color: colors.mutedForeground }]}>{currentXP}/{xpNeeded} XP</Text>
                      {nextUnlock && (
                        <Text style={[styles.nextUnlockText, { color: colors.mutedForeground }]} numberOfLines={1}>
                          Niv.{nextUnlock.level}: {nextUnlock.reward}
                        </Text>
                      )}
                    </View>
                  </View>
                  <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* ── Talents tab ── */}
        {activeTab === 'talents' && (
          <>
            {/* Talent points display */}
            <View style={[styles.tpDisplay, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Feather name="star" size={18} color="#9966CC" />
              <Text style={[styles.tpCount, { color: '#9966CC' }]}>{player.talentPoints}</Text>
              <Text style={[styles.tpLabel, { color: colors.mutedForeground }]}>
                {player.talentPoints === 0 ? 'Points de talent (gagnez 1 pt tous les 5 niveaux de compétence)' : `Point${player.talentPoints > 1 ? 's' : ''} de talent disponible${player.talentPoints > 1 ? 's' : ''}`}
              </Text>
            </View>
            <Text style={[styles.tpTip, { color: colors.mutedForeground }]}>
              {player.talentsUnlocked.length} / {game.allTalents.length} talents débloqués
            </Text>

            {/* Tree selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.treePicker} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
              {(Object.entries(TREE_INFO) as [TreeKey, typeof TREE_INFO[TreeKey]][]).map(([key, info]) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.treeTab,
                    {
                      backgroundColor: selectedTree === key ? info.color : colors.card,
                      borderColor: info.color,
                    },
                  ]}
                  onPress={() => setSelectedTree(key)}
                >
                  <Feather name={info.icon as 'tool'} size={13} color={selectedTree === key ? '#fff' : info.color} />
                  <Text style={[styles.treeTabText, { color: selectedTree === key ? '#fff' : info.color }]}>{info.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <TalentTreeView treeKey={selectedTree} game={game} colors={colors} />
          </>
        )}

        {/* ── Stats tab ── */}
        {activeTab === 'stats' && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>STATISTIQUES</Text>
            <View style={styles.statsGrid}>
              {[
                { label: 'Objets forgés', value: String(player.totalItemsCrafted), icon: 'package' },
                { label: 'Or total gagné', value: player.totalGoldEarned.toLocaleString() + 'g', icon: 'dollar-sign' },
                { label: 'Niveaux cumulés', value: String(totalSkillLevels), icon: 'star' },
                { label: 'Or actuel', value: player.gold.toLocaleString() + 'g', icon: 'credit-card' },
                { label: 'Talents débloqués', value: `${player.talentsUnlocked.length} / ${game.allTalents.length}`, icon: 'award' },
                { label: 'Niveau forgeron', value: String(player.forgeLevel), icon: 'tool' },
              ].map((s) => (
                <View key={s.label} style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Feather name={s.icon as 'tool'} size={18} color={colors.primary} />
                  <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
                  <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={[styles.resetBtn, { borderColor: '#C0392B' }]} onPress={handleReset}>
              <Feather name="refresh-cw" size={15} color="#C0392B" />
              <Text style={[styles.resetBtnText, { color: '#C0392B' }]}>Réinitialiser la partie</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Skill detail modal */}
      <SkillDetailModal
        skill={selectedSkill}
        level={selectedSkill ? player.skills[selectedSkill.id] ?? 1 : 1}
        xp={selectedSkill ? player.skillXP[selectedSkill.id] ?? 0 : 0}
        onClose={() => setSelectedSkillId(null)}
        colors={colors}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: 3 },
  tpBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  tpBadgeText: { fontSize: 11, fontWeight: '700', color: '#fff' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, gap: 5 },
  saveBtnText: { fontSize: 12, fontWeight: '600' },
  playerCard: { borderRadius: 16, padding: 16, borderWidth: 1, marginHorizontal: 16, marginBottom: 0 },
  playerCardTop: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 20, fontWeight: '800' },
  playerInfo: { flex: 1 },
  playerName: { fontSize: 17, fontWeight: '700' },
  playerTitle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  playerSub: { fontSize: 10, marginTop: 2 },
  levelCircle: { width: 50, height: 50, borderRadius: 25, borderWidth: 2, justifyContent: 'center', alignItems: 'center' },
  levelNumber: { fontSize: 18, fontWeight: '800' },
  levelLabel: { fontSize: 8, fontWeight: '600', letterSpacing: 1 },
  xpSection: {},
  xpLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  xpLabel: { fontSize: 10 },
  xpTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 3 },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, marginTop: 12 },
  tabPill: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  content: { paddingHorizontal: 16, paddingTop: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
  skillRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 8 },
  skillIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  skillInfo: { flex: 1 },
  skillNameRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  skillName: { fontSize: 14, fontWeight: '600' },
  skillLevel: { fontSize: 13, fontWeight: '700' },
  skillTrack: { height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  skillFill: { height: '100%', borderRadius: 3, minWidth: 4 },
  skillFooter: { flexDirection: 'row', justifyContent: 'space-between' },
  skillXPText: { fontSize: 10 },
  nextUnlockText: { fontSize: 10, flex: 1, textAlign: 'right', marginLeft: 8 },
  tpDisplay: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 6 },
  tpCount: { fontSize: 22, fontWeight: '800' },
  tpLabel: { flex: 1, fontSize: 11, lineHeight: 16 },
  tpTip: { fontSize: 11, marginBottom: 10 },
  treePicker: { marginBottom: 12, marginHorizontal: -16 },
  treeTab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  treeTabText: { fontSize: 12, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  statCard: { width: '47%', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, gap: 5 },
  statValue: { fontSize: 17, fontWeight: '700' },
  statLabel: { fontSize: 10, letterSpacing: 0.5, textAlign: 'center' },
  resetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 12, borderWidth: 1, gap: 8 },
  resetBtnText: { fontSize: 14, fontWeight: '600' },
});
