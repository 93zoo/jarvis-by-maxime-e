import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ActivityIndicator,
  Alert,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Reanimated, {
  useSharedValue,
  withTiming,
  useAnimatedStyle,
  useReducedMotion,
  Easing,
  type SharedValue,
} from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useGame } from '@/context/GameContext';
import { useAchievements } from '@/context/AchievementContext';
import { useColors } from '@/hooks/useColors';
import AudioManager from '@/utils/AudioManager';
import { saveAudioSettings } from '@/utils/audioSettings';
import type { Achievement, ForgeHistoryEntry, SessionSnapshot, SkillData, SkillType, TalentData } from '@/types/game';

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
const CANVAS_W = 320;
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
  const unlockedInTree = treeTalents.filter((t) => isTalentUnlocked(t.id)).length;

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
      <View style={[tStyles.treeSummary, { backgroundColor: colors.card, borderColor: info.color + '55' }]}>
        <View style={[tStyles.treeSummaryIcon, { backgroundColor: info.color + '22' }]}>
          <Feather name={info.icon as 'tool'} size={18} color={info.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[tStyles.treeSummaryTitle, { color: colors.foreground }]}>{info.label}</Text>
          <Text style={[tStyles.treeSummaryText, { color: colors.mutedForeground }]}>
            {unlockedInTree}/{treeTalents.length} débloqués · Touchez un nœud pour voir ses prérequis
          </Text>
        </View>
        <View style={[tStyles.treeState, { backgroundColor: '#9966CC22' }]}>
          <Text style={[tStyles.treeStateText, { color: '#9966CC' }]}>{game.player.talentPoints} pt</Text>
        </View>
      </View>
      {/* Canvas */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: 16 }}
        contentContainerStyle={{ justifyContent: 'center' }}
      >
        <View style={{ width: CANVAS_W, height: CANVAS_H }}>
          {Array.from({ length: 5 }).map((_, tier) => (
            <View
              key={`tier-${tier}`}
              pointerEvents="none"
              style={[tStyles.tierRow, { top: TIER0_Y + tier * TIER_STEP - 40, borderColor: colors.border }]}
            >
              <Text style={[tStyles.tierLabel, { color: colors.mutedForeground }]}>PALIER {tier + 1}</Text>
            </View>
          ))}
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
  treeSummary: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 10, padding: 12, borderRadius: 14, borderWidth: 1 },
  treeSummaryIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  treeSummaryTitle: { fontSize: 14, fontWeight: '800', marginBottom: 2 },
  treeSummaryText: { fontSize: 11, lineHeight: 16 },
  treeState: { paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10 },
  treeStateText: { fontSize: 12, fontWeight: '800' },
  tierRow: { position: 'absolute', left: 18, right: 18, height: 80, borderTopWidth: 1, borderBottomWidth: 1, opacity: 0.42 },
  tierLabel: { position: 'absolute', top: 5, left: 4, fontSize: 8, fontWeight: '800', letterSpacing: 1 },
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

// ─── Sparkline Animation Helpers ─────────────────────────────────────────────

/** Covers the chart from the right, shrinks away to reveal lines left-to-right. */
function SparklineRevealMask({
  drawProgress,
  chartWidth,
  color,
}: {
  drawProgress: SharedValue<number>;
  chartWidth: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => ({
    width: (1 - drawProgress.value) * chartWidth,
  }));
  return (
    <Reanimated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          backgroundColor: color,
          zIndex: 10,
        },
        style,
      ]}
    />
  );
}

/** Fades a dot in once the wipe animation has passed its x position.
 *  Renders as an absolutely-positioned overlay so dots sit on the chart. */
function AnimatedSparkDot({
  xFraction,
  drawProgress,
  leftPct,
  bottom,
  children,
}: {
  xFraction: number;
  drawProgress: SharedValue<number>;
  leftPct: number;
  bottom: number;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: drawProgress.value >= xFraction - 0.01 ? 1 : 0,
  }));
  return (
    <Reanimated.View
      style={[
        {
          position: 'absolute',
          left: `${leftPct}%` as `${number}%`,
          bottom,
          width: 28,
          height: 28,
          marginLeft: -14,
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 11,
        },
        style,
      ]}
    >
      {children}
    </Reanimated.View>
  );
}

// ─── Level Sparkline ─────────────────────────────────────────────────────────
const SPARKLINE_H = 60;
const SPARKLINE_DOT = 5;

type SparkMetric = 'level' | 'gold' | 'items';

interface MetricConfig {
  key: SparkMetric;
  label: string;
  title: string;
  icon: string;
  color: (colors: ReturnType<typeof useColors>) => string;
  getValue: (s: SessionSnapshot) => number;
  formatValue: (v: number) => string;
  formatDelta: (delta: number) => string;
  yLabel: (v: number) => string;
}

const SPARK_METRICS: MetricConfig[] = [
  {
    key: 'level',
    label: 'Niveau',
    title: 'NIVEAU FORGERON',
    icon: 'trending-up',
    color: (c) => c.primary,
    getValue: (s) => s.playerLevel,
    formatValue: (v) => `Niv.${v}`,
    formatDelta: (d) => `${d >= 0 ? '+' : ''}${d} niv.`,
    yLabel: (v) => `Niv.${v}`,
  },
  {
    key: 'gold',
    label: 'Or',
    title: 'OR EN CAISSE',
    icon: 'dollar-sign',
    color: () => '#D4AF37',
    getValue: (s) => s.gold,
    formatValue: (v) => `${v.toLocaleString()}g`,
    formatDelta: (d) => `${d >= 0 ? '+' : ''}${d.toLocaleString()}g`,
    yLabel: (v) => `${v >= 1000 ? `${Math.round(v / 100) / 10}k` : v}g`,
  },
  {
    key: 'items',
    label: 'Objets',
    title: 'OBJETS FORGÉS',
    icon: 'package',
    color: (c) => c.accent,
    getValue: (s) => s.totalItemsCrafted,
    formatValue: (v) => `${v}`,
    formatDelta: (d) => `${d >= 0 ? '+' : ''}${d}`,
    yLabel: (v) => `${v}`,
  },
];

const STORAGE_KEY_METRIC = '@profile/chart_metric';
const STORAGE_KEY_SKILL  = '@profile/chart_skill';

function LevelSparkline({
  snapshots,
  colors,
}: {
  snapshots: SessionSnapshot[];
  colors: ReturnType<typeof useColors>;
}) {
  const [metric, setMetric] = useState<SparkMetric>('level');
  const [chartWidth, setChartWidth] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const cfg = SPARK_METRICS.find((m) => m.key === metric)!

  // Restore last-used metric on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_METRIC).then((stored) => {
      if (stored && SPARK_METRICS.some((m) => m.key === stored)) {
        setMetric(stored as SparkMetric);
      }
    }).catch(() => {/* ignore */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const dotColor = cfg.color(colors);

  // ── Draw-in animation ────────────────────────────────────────────────────
  const reducedMotion = useReducedMotion();
  const drawProgress = useSharedValue(reducedMotion ? 1 : 0);

  // Trigger (or re-trigger) the wipe whenever metric tab changes
  useEffect(() => {
    drawProgress.value = 0;
    if (reducedMotion) {
      drawProgress.value = 1;
    } else {
      drawProgress.value = withTiming(1, {
        duration: 500,
        easing: Easing.out(Easing.cubic),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metric]);

  // Also trigger on first valid chartWidth measurement
  const hasAnimated = useRef(false);
  useEffect(() => {
    if (chartWidth > 0 && !hasAnimated.current) {
      hasAnimated.current = true;
      drawProgress.value = 0;
      if (!reducedMotion) {
        drawProgress.value = withTiming(1, {
          duration: 500,
          easing: Easing.out(Easing.cubic),
        });
      } else {
        drawProgress.value = 1;
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartWidth]);

  // ── Swipe navigation ────────────────────────────────────────────────────
  const sparkCountRef = useRef(snapshots.length);
  sparkCountRef.current = snapshots.length;
  const sparkPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > 5,
      onPanResponderRelease: (_, gs) => {
        const c = sparkCountRef.current;
        if (c <= 1 || Math.abs(gs.dx) < 20) return;
        setSelectedIdx((prev) => {
          // If nothing selected: left-swipe starts at index 0, right-swipe starts at last
          const current = prev ?? (gs.dx < 0 ? -1 : c);
          return gs.dx < 0
            ? Math.min(current + 1, c - 1)
            : Math.max(current - 1, 0);
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
    })
  ).current;

  if (snapshots.length === 0) {
    return (
      <View style={[sparkStyles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="trending-up" size={20} color={colors.mutedForeground} />
        <Text style={[sparkStyles.emptyText, { color: colors.mutedForeground }]}>
          Sauvegardez votre partie pour commencer à tracer votre progression
        </Text>
      </View>
    );
  }

  const values = snapshots.map(cfg.getValue);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const padding = Math.max(1, Math.round((maxVal - minVal) * 0.1));
  const lo = Math.max(0, minVal - padding);
  const hi = maxVal + padding;
  const range = hi - lo || 1;
  const count = snapshots.length;

  return (
    <View style={[sparkStyles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Title row */}
      <View style={sparkStyles.titleRow}>
        <Text style={[sparkStyles.title, { color: colors.foreground }]}>{cfg.title}</Text>
        <View style={[sparkStyles.badge, { backgroundColor: `${dotColor}22` }]}>
          <Text style={[sparkStyles.badgeText, { color: dotColor }]}>
            {count} session{count !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Metric selector */}
      <View style={sparkStyles.metricSelector}>
        {SPARK_METRICS.map((m) => {
          const active = m.key === metric;
          const mColor = m.color(colors);
          return (
            <TouchableOpacity
              key={m.key}
              activeOpacity={0.75}
              onPress={() => {
                setMetric(m.key);
                setSelectedIdx(null);
                AsyncStorage.setItem(STORAGE_KEY_METRIC, m.key).catch(() => {/* ignore */});
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={[
                sparkStyles.metricBtn,
                {
                  backgroundColor: active ? `${mColor}22` : 'transparent',
                  borderColor: active ? mColor : colors.border,
                },
              ]}
            >
              <Feather name={m.icon as 'tool'} size={10} color={active ? mColor : colors.mutedForeground} />
              <Text style={[sparkStyles.metricBtnText, { color: active ? mColor : colors.mutedForeground }]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Chart area — swipe left/right to step through sessions */}
      <View
        style={[sparkStyles.chart, { height: SPARKLINE_H }]}
        onLayout={(e) => setChartWidth(e.nativeEvent.layout.width)}
        {...sparkPanResponder.panHandlers}
      >
        {/* Horizontal gridlines */}
        {[0, 0.5, 1].map((frac) => (
          <View
            key={frac}
            pointerEvents="none"
            style={[
              sparkStyles.gridLine,
              {
                bottom: frac * (SPARKLINE_H - SPARKLINE_DOT * 2) + SPARKLINE_DOT - 1,
                backgroundColor: colors.border,
              },
            ]}
          />
        ))}

        {/* Connecting lines between adjacent dots */}
        {chartWidth > 0 && count > 1 && snapshots.map((snap, i) => {
          if (i === 0) return null;
          const prevSnap = snapshots[i - 1];
          const prevVal = cfg.getValue(prevSnap);
          const currVal = cfg.getValue(snap);
          const prevFrac = (prevVal - lo) / range;
          const currFrac = (currVal - lo) / range;
          const prevBottom = prevFrac * (SPARKLINE_H - SPARKLINE_DOT * 2) + SPARKLINE_DOT - SPARKLINE_DOT / 2;
          const currBottom = currFrac * (SPARKLINE_H - SPARKLINE_DOT * 2) + SPARKLINE_DOT - SPARKLINE_DOT / 2;
          const prevLeftPct = (i - 1) / (count - 1);
          const currLeftPct = i / (count - 1);
          // Convert to pixel coords (y measured from top)
          const x1 = prevLeftPct * chartWidth;
          const y1 = SPARKLINE_H - prevBottom - SPARKLINE_DOT / 2;
          const x2 = currLeftPct * chartWidth;
          const y2 = SPARKLINE_H - currBottom - SPARKLINE_DOT / 2;
          const dx = x2 - x1;
          const dy = y2 - y1;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          return (
            <View
              key={`line-${snap.timestamp}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: (x1 + x2) / 2 - length / 2,
                top: (y1 + y2) / 2 - 1,
                width: length,
                height: 2,
                backgroundColor: dotColor,
                opacity: 0.55,
                transform: [{ rotate: `${angle}deg` }],
              }}
            />
          );
        })}

        {/* Reveal mask — sweeps from right to left, uncovering lines */}
        {chartWidth > 0 && (
          <SparklineRevealMask
            drawProgress={drawProgress}
            chartWidth={chartWidth}
            color={colors.card}
          />
        )}

        {/* Dots — each fades in as the wipe reaches its x position */}
        {snapshots.map((snap, i) => {
          const val = cfg.getValue(snap);
          const frac = (val - lo) / range;
          const dotBottom = frac * (SPARKLINE_H - SPARKLINE_DOT * 2) + SPARKLINE_DOT - SPARKLINE_DOT / 2;
          const leftPct = count === 1 ? 50 : (i / (count - 1)) * 100;
          const xFraction = count === 1 ? 0.5 : i / (count - 1);
          const isLast = i === count - 1;
          const isSelected = selectedIdx === i;
          const dotSize = isSelected ? SPARKLINE_DOT + 5 : isLast ? SPARKLINE_DOT + 2 : SPARKLINE_DOT;

          return (
            <AnimatedSparkDot
              key={snap.timestamp}
              xFraction={xFraction}
              drawProgress={drawProgress}
              leftPct={leftPct}
              bottom={dotBottom - 12}
            >
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  setSelectedIdx(selectedIdx === i ? null : i);
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }}
                style={{ width: 28, height: 28, justifyContent: 'center', alignItems: 'center' }}
              >
                <View
                  style={{
                    width: dotSize,
                    height: dotSize,
                    borderRadius: dotSize / 2,
                    backgroundColor: isSelected ? dotColor : isLast ? dotColor : `${dotColor}99`,
                    borderWidth: isSelected ? 2 : 0,
                    borderColor: '#fff',
                  }}
                />
              </TouchableOpacity>
            </AnimatedSparkDot>
          );
        })}
      </View>

      {/* Selected dot detail card */}
      {selectedIdx !== null && snapshots[selectedIdx] && (() => {
        const snap = snapshots[selectedIdx];
        const date = new Date(snap.timestamp).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        return (
          <View style={[sparkStyles.dotDetail, { backgroundColor: colors.secondary, borderColor: dotColor }]}>
            <View style={sparkStyles.dotDetailHeader}>
              <Feather name="calendar" size={11} color={colors.mutedForeground} />
              <Text style={[sparkStyles.dotDetailDate, { color: colors.mutedForeground }]}>{date}</Text>
              <TouchableOpacity onPress={() => setSelectedIdx(null)} style={sparkStyles.dotDetailClose}>
                <Feather name="x" size={12} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <View style={sparkStyles.dotDetailMetrics}>
              {SPARK_METRICS.map((m) => {
                const v = m.getValue(snap);
                const mColor = m.color(colors);
                return (
                  <View key={m.key} style={sparkStyles.dotDetailMetric}>
                    <Feather name={m.icon as 'tool'} size={11} color={mColor} />
                    <Text style={[sparkStyles.dotDetailMetricLabel, { color: colors.mutedForeground }]}>{m.label}</Text>
                    <Text style={[sparkStyles.dotDetailMetricValue, { color: mColor }]}>{m.formatValue(v)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        );
      })()}

      {/* X-axis labels: first and last date */}
      <View style={sparkStyles.xLabels}>
        <Text style={[sparkStyles.xLabel, { color: colors.mutedForeground }]}>
          {new Date(snapshots[0].timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </Text>
        {snapshots.length > 1 && (
          <Text style={[sparkStyles.xLabel, { color: colors.mutedForeground }]}>
            {new Date(snapshots[snapshots.length - 1].timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </Text>
        )}
      </View>

      {/* Y-axis labels */}
      <View style={sparkStyles.yLabels}>
        <Text style={[sparkStyles.yLabel, { color: colors.mutedForeground }]}>{cfg.yLabel(maxVal)}</Text>
        <Text style={[sparkStyles.yLabel, { color: colors.mutedForeground }]}>{cfg.yLabel(minVal)}</Text>
      </View>

      {/* Summary row */}
      <View style={[sparkStyles.summaryRow, { borderTopColor: colors.border }]}>
        <View style={sparkStyles.summaryItem}>
          <Text style={[sparkStyles.summaryLabel, { color: colors.mutedForeground }]}>Départ</Text>
          <Text style={[sparkStyles.summaryValue, { color: colors.foreground }]}>{cfg.formatValue(values[0])}</Text>
        </View>
        <View style={[sparkStyles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={sparkStyles.summaryItem}>
          <Text style={[sparkStyles.summaryLabel, { color: colors.mutedForeground }]}>Actuel</Text>
          <Text style={[sparkStyles.summaryValue, { color: dotColor }]}>{cfg.formatValue(values[count - 1])}</Text>
        </View>
        <View style={[sparkStyles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={sparkStyles.summaryItem}>
          <Text style={[sparkStyles.summaryLabel, { color: colors.mutedForeground }]}>Progression</Text>
          <Text style={[sparkStyles.summaryValue, { color: values[count - 1] > values[0] ? '#4CAF50' : colors.foreground }]}>
            {cfg.formatDelta(values[count - 1] - values[0])}
          </Text>
        </View>
      </View>
    </View>
  );
}

const sparkStyles = StyleSheet.create({
  empty: { borderRadius: 14, borderWidth: 1, padding: 20, alignItems: 'center', gap: 8, marginBottom: 16 },
  emptyText: { fontSize: 12, textAlign: 'center', lineHeight: 17 },
  container: { borderRadius: 14, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 12, marginBottom: 6 },
  title: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  metricSelector: { flexDirection: 'row', gap: 6, paddingHorizontal: 14, marginBottom: 8 },
  metricBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  metricBtnText: { fontSize: 10, fontWeight: '700' },
  chart: { marginHorizontal: 14, marginBottom: 4, position: 'relative' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, opacity: 0.4 },
  dot: { position: 'absolute' },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, marginBottom: 4 },
  xLabel: { fontSize: 9, fontWeight: '600' },
  yLabels: { position: 'absolute', right: 14, top: 56, justifyContent: 'space-between', height: SPARKLINE_H, gap: 0, flexDirection: 'column' },
  yLabel: { fontSize: 9, fontWeight: '600', lineHeight: 12 },
  summaryRow: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 10 },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivider: { width: 1, marginVertical: 4 },
  summaryLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5 },
  summaryValue: { fontSize: 14, fontWeight: '800' },
  dotDetail: { marginHorizontal: 14, marginBottom: 8, borderRadius: 10, borderWidth: 1, padding: 10 },
  dotDetailHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
  dotDetailDate: { flex: 1, fontSize: 10, fontWeight: '600' },
  dotDetailClose: { padding: 2 },
  dotDetailMetrics: { flexDirection: 'row', justifyContent: 'space-around' },
  dotDetailMetric: { alignItems: 'center', gap: 3 },
  dotDetailMetricLabel: { fontSize: 9, fontWeight: '600' },
  dotDetailMetricValue: { fontSize: 13, fontWeight: '800' },
});

// ─── Skill Progress Chart ────────────────────────────────────────────────────
const SKILL_CHART_COLORS: Record<SkillType, string> = {
  forge: '#D4851A', extraction: '#7A7A8C', commerce: '#D4AF37',
  construction: '#8B6B3D', enchantment: '#9966CC', cooking: '#E67E22',
  harvest: '#4CAF50', combat: '#EF5350',
};

const SKILL_CHART_LABELS: Record<SkillType, string> = {
  forge: 'Forge', extraction: 'Extrac.', commerce: 'Commerce',
  construction: 'Constr.', enchantment: 'Enchant.', cooking: 'Cuisine',
  harvest: 'Récolte', combat: 'Combat',
};

const SKILL_TYPES_LIST: SkillType[] = [
  'forge', 'extraction', 'commerce', 'construction',
  'enchantment', 'cooking', 'harvest', 'combat',
];

function SkillProgressChart({
  snapshots,
  colors,
}: {
  snapshots: SessionSnapshot[];
  colors: ReturnType<typeof useColors>;
}) {
  const [selectedSkill, setSelectedSkill] = useState<SkillType>('forge');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  // Restore last-used skill on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY_SKILL).then((stored) => {
      if (stored && SKILL_TYPES_LIST.includes(stored as SkillType)) {
        setSelectedSkill(stored as SkillType);
      }
    }).catch(() => {/* ignore */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only snapshots that have skill data
  const skillSnapshots = useMemo(
    () => snapshots.filter((s) => s.skills != null),
    [snapshots],
  );

  const dotColor = SKILL_CHART_COLORS[selectedSkill];

  // ── Swipe navigation ────────────────────────────────────────────────────
  const scCountRef = useRef(0);
  scCountRef.current = skillSnapshots.length;
  const scPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > Math.abs(gs.dy) && Math.abs(gs.dx) > 5,
      onPanResponderRelease: (_, gs) => {
        const c = scCountRef.current;
        if (c <= 1 || Math.abs(gs.dx) < 20) return;
        setSelectedIdx((prev) => {
          const current = prev ?? (gs.dx < 0 ? -1 : c);
          return gs.dx < 0
            ? Math.min(current + 1, c - 1)
            : Math.max(current - 1, 0);
        });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
    })
  ).current;

  if (skillSnapshots.length === 0) {
    return (
      <View style={[scStyles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Feather name="bar-chart-2" size={20} color={colors.mutedForeground} />
        <Text style={[scStyles.emptyText, { color: colors.mutedForeground }]}>
          Sauvegardez votre partie pour commencer à tracer la progression des compétences
        </Text>
      </View>
    );
  }

  const values = skillSnapshots.map((s) => (s.skills?.[selectedSkill] ?? 1));
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const padding = Math.max(1, Math.round((maxVal - minVal) * 0.1));
  const lo = Math.max(0, minVal - padding);
  const hi = maxVal + padding;
  const range = hi - lo || 1;
  const count = skillSnapshots.length;

  return (
    <View style={[scStyles.container, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Title row */}
      <View style={scStyles.titleRow}>
        <Text style={[scStyles.title, { color: colors.foreground }]}>PAR COMPÉTENCE</Text>
        <View style={[scStyles.badge, { backgroundColor: `${dotColor}22` }]}>
          <Text style={[scStyles.badgeText, { color: dotColor }]}>
            {count} session{count !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Skill selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={scStyles.selectorScroll}
        contentContainerStyle={scStyles.selectorContent}
      >
        {SKILL_TYPES_LIST.map((sk) => {
          const active = sk === selectedSkill;
          const skColor = SKILL_CHART_COLORS[sk];
          return (
            <TouchableOpacity
              key={sk}
              activeOpacity={0.75}
              onPress={() => {
                setSelectedSkill(sk);
                setSelectedIdx(null);
                AsyncStorage.setItem(STORAGE_KEY_SKILL, sk).catch(() => {/* ignore */});
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={[
                scStyles.skillBtn,
                {
                  backgroundColor: active ? `${skColor}22` : 'transparent',
                  borderColor: active ? skColor : colors.border,
                },
              ]}
            >
              <Feather
                name={(SKILL_ICONS[sk] ?? 'star') as 'tool'}
                size={10}
                color={active ? skColor : colors.mutedForeground}
              />
              <Text style={[scStyles.skillBtnText, { color: active ? skColor : colors.mutedForeground }]}>
                {SKILL_CHART_LABELS[sk]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Chart area — swipe left/right to step through sessions */}
      <View style={[scStyles.chart, { height: SPARKLINE_H }]} {...scPanResponder.panHandlers}>
        {/* Gridlines */}
        {[0, 0.5, 1].map((frac) => (
          <View
            key={frac}
            pointerEvents="none"
            style={[
              scStyles.gridLine,
              {
                bottom: frac * (SPARKLINE_H - SPARKLINE_DOT * 2) + SPARKLINE_DOT - 1,
                backgroundColor: colors.border,
              },
            ]}
          />
        ))}

        {/* Dots */}
        {skillSnapshots.map((snap, i) => {
          const val = snap.skills?.[selectedSkill] ?? 1;
          const frac = (val - lo) / range;
          const dotBottom = frac * (SPARKLINE_H - SPARKLINE_DOT * 2) + SPARKLINE_DOT - SPARKLINE_DOT / 2;
          const leftPct = count === 1 ? 50 : (i / (count - 1)) * 100;
          const isLast = i === count - 1;
          const isSelected = selectedIdx === i;
          const dotSize = isSelected ? SPARKLINE_DOT + 5 : isLast ? SPARKLINE_DOT + 2 : SPARKLINE_DOT;
          return (
            <TouchableOpacity
              key={snap.timestamp}
              activeOpacity={0.7}
              onPress={() => {
                setSelectedIdx(selectedIdx === i ? null : i);
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }}
              style={{
                position: 'absolute',
                left: `${leftPct}%` as `${number}%`,
                bottom: dotBottom - 12,
                width: 28,
                height: 28,
                marginLeft: -14,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <View
                style={{
                  width: dotSize,
                  height: dotSize,
                  borderRadius: dotSize / 2,
                  backgroundColor: isSelected ? dotColor : isLast ? dotColor : `${dotColor}99`,
                  borderWidth: isSelected ? 2 : 0,
                  borderColor: '#fff',
                }}
              />
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Selected dot detail card */}
      {selectedIdx !== null && skillSnapshots[selectedIdx] && (() => {
        const snap = skillSnapshots[selectedIdx];
        const date = new Date(snap.timestamp).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        const skillVal = snap.skills?.[selectedSkill] ?? 1;
        return (
          <View style={[scStyles.dotDetail, { backgroundColor: colors.secondary, borderColor: dotColor }]}>
            <View style={scStyles.dotDetailHeader}>
              <Feather name="calendar" size={11} color={colors.mutedForeground} />
              <Text style={[scStyles.dotDetailDate, { color: colors.mutedForeground }]}>{date}</Text>
              <TouchableOpacity onPress={() => setSelectedIdx(null)} style={scStyles.dotDetailClose}>
                <Feather name="x" size={12} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            <View style={scStyles.dotDetailBody}>
              <Text style={[scStyles.dotDetailSkill, { color: dotColor }]}>
                {SKILL_CHART_LABELS[selectedSkill]}
              </Text>
              <Text style={[scStyles.dotDetailValue, { color: dotColor }]}>Niv.{skillVal}</Text>
            </View>
            {snap.skills && (
              <View style={scStyles.dotDetailAllSkills}>
                {SKILL_TYPES_LIST.filter((sk) => sk !== selectedSkill).map((sk) => {
                  const v = snap.skills?.[sk] ?? 1;
                  const c = SKILL_CHART_COLORS[sk];
                  return (
                    <View key={sk} style={scStyles.dotDetailSkillChip}>
                      <Feather name={(SKILL_ICONS[sk] ?? 'star') as 'tool'} size={9} color={c} />
                      <Text style={[scStyles.dotDetailChipText, { color: colors.mutedForeground }]}>{SKILL_CHART_LABELS[sk]}</Text>
                      <Text style={[scStyles.dotDetailChipVal, { color: c }]}>{v}</Text>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        );
      })()}

      {/* X-axis labels */}
      <View style={scStyles.xLabels}>
        <Text style={[scStyles.xLabel, { color: colors.mutedForeground }]}>
          {new Date(skillSnapshots[0].timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </Text>
        {skillSnapshots.length > 1 && (
          <Text style={[scStyles.xLabel, { color: colors.mutedForeground }]}>
            {new Date(skillSnapshots[skillSnapshots.length - 1].timestamp).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
          </Text>
        )}
      </View>

      {/* Y-axis labels */}
      <View style={scStyles.yLabels}>
        <Text style={[scStyles.yLabel, { color: colors.mutedForeground }]}>Niv.{maxVal}</Text>
        <Text style={[scStyles.yLabel, { color: colors.mutedForeground }]}>Niv.{minVal}</Text>
      </View>

      {/* Summary */}
      <View style={[scStyles.summaryRow, { borderTopColor: colors.border }]}>
        <View style={scStyles.summaryItem}>
          <Text style={[scStyles.summaryLabel, { color: colors.mutedForeground }]}>Départ</Text>
          <Text style={[scStyles.summaryValue, { color: colors.foreground }]}>Niv.{values[0]}</Text>
        </View>
        <View style={[scStyles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={scStyles.summaryItem}>
          <Text style={[scStyles.summaryLabel, { color: colors.mutedForeground }]}>Actuel</Text>
          <Text style={[scStyles.summaryValue, { color: dotColor }]}>Niv.{values[count - 1]}</Text>
        </View>
        <View style={[scStyles.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={scStyles.summaryItem}>
          <Text style={[scStyles.summaryLabel, { color: colors.mutedForeground }]}>Progression</Text>
          <Text style={[scStyles.summaryValue, { color: values[count - 1] > values[0] ? '#4CAF50' : colors.foreground }]}>
            {values[count - 1] - values[0] >= 0 ? '+' : ''}{values[count - 1] - values[0]} niv.
          </Text>
        </View>
      </View>
    </View>
  );
}

const scStyles = StyleSheet.create({
  empty: { borderRadius: 14, borderWidth: 1, padding: 20, alignItems: 'center', gap: 8, marginBottom: 16 },
  emptyText: { fontSize: 12, textAlign: 'center', lineHeight: 17 },
  container: { borderRadius: 14, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 12, marginBottom: 6 },
  title: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  selectorScroll: { marginBottom: 8 },
  selectorContent: { flexDirection: 'row', gap: 6, paddingHorizontal: 14 },
  skillBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  skillBtnText: { fontSize: 10, fontWeight: '700' },
  chart: { marginHorizontal: 14, marginBottom: 4, position: 'relative' },
  gridLine: { position: 'absolute', left: 0, right: 0, height: 1, opacity: 0.4 },
  dot: { position: 'absolute' },
  xLabels: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, marginBottom: 4 },
  xLabel: { fontSize: 9, fontWeight: '600' },
  yLabels: { position: 'absolute', right: 14, top: 56, justifyContent: 'space-between', height: SPARKLINE_H, gap: 0, flexDirection: 'column' },
  yLabel: { fontSize: 9, fontWeight: '600', lineHeight: 12 },
  summaryRow: { flexDirection: 'row', borderTopWidth: 1, paddingVertical: 10 },
  summaryItem: { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivider: { width: 1, marginVertical: 4 },
  summaryLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5 },
  summaryValue: { fontSize: 14, fontWeight: '800' },
  dotDetail: { marginHorizontal: 14, marginBottom: 8, borderRadius: 10, borderWidth: 1, padding: 10 },
  dotDetailHeader: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  dotDetailDate: { flex: 1, fontSize: 10, fontWeight: '600' },
  dotDetailClose: { padding: 2 },
  dotDetailBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  dotDetailSkill: { fontSize: 13, fontWeight: '800' },
  dotDetailValue: { fontSize: 18, fontWeight: '800' },
  dotDetailAllSkills: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  dotDetailSkillChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.05)' },
  dotDetailChipText: { fontSize: 9, fontWeight: '600' },
  dotDetailChipVal: { fontSize: 10, fontWeight: '800' },
});

// ─── Audio Settings Card ──────────────────────────────────────────────────────
function AudioSettingsCard({ colors }: { colors: ReturnType<typeof useColors> }) {
  const [muted, setMuted] = useState(() => AudioManager.isMuted());
  const [volume, setVolume] = useState(() => AudioManager.getVolume());
  // Use refs so the PanResponder closure always reads the latest values
  const trackWidthRef = useRef(0);
  const volumeRef = useRef(volume);
  volumeRef.current = volume;

  // Persist to AsyncStorage whenever settings change
  const persist = useCallback((newMuted: boolean, newVolume: number) => {
    saveAudioSettings({ muted: newMuted, volume: newVolume });
  }, []);

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    AudioManager.setMuted(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    persist(next, volumeRef.current);
  };

  const applyVolumeFromX = (x: number) => {
    const w = trackWidthRef.current;
    if (w <= 0) return;
    const newVol = Math.max(0, Math.min(1, x / w));
    setVolume(newVol);
    volumeRef.current = newVol;
    AudioManager.setVolume(newVol);
    if (AudioManager.isMuted()) {
      setMuted(false);
      AudioManager.setMuted(false);
    }
  };

  // Volume slider via PanResponder on the track
  const sliderPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (evt) => applyVolumeFromX(evt.nativeEvent.locationX),
      onPanResponderMove: (evt) => applyVolumeFromX(evt.nativeEvent.locationX),
      onPanResponderRelease: () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        persist(AudioManager.isMuted(), volumeRef.current);
      },
    })
  ).current;

  const effectiveVolume = muted ? 0 : volume;
  const volumeIcon: 'volume-x' | 'volume-1' | 'volume-2' =
    muted || volume === 0 ? 'volume-x' : volume < 0.5 ? 'volume-1' : 'volume-2';

  return (
    <View style={[audioStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Mute toggle row */}
      <View style={audioStyles.row}>
        <View style={[audioStyles.iconWrap, { backgroundColor: colors.primary + '22' }]}>
          <Feather name={volumeIcon} size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[audioStyles.label, { color: colors.foreground }]}>Son du jeu</Text>
          <Text style={[audioStyles.sublabel, { color: colors.mutedForeground }]}>
            {muted ? 'Son désactivé' : `Volume : ${Math.round(volume * 100)}%`}
          </Text>
        </View>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleToggleMute}
          style={[
            audioStyles.muteBtn,
            { backgroundColor: muted ? '#EF535022' : colors.primary + '22', borderColor: muted ? '#EF5350' : colors.primary },
          ]}
        >
          <Text style={[audioStyles.muteBtnText, { color: muted ? '#EF5350' : colors.primary }]}>
            {muted ? 'Activer' : 'Couper'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Volume slider */}
      <View style={audioStyles.sliderRow}>
        <Feather name="volume" size={12} color={colors.mutedForeground} />
        <View
          style={[audioStyles.track, { backgroundColor: colors.muted }]}
          onLayout={(e) => { trackWidthRef.current = e.nativeEvent.layout.width; }}
          {...sliderPan.panHandlers}
        >
          <View
            style={[
              audioStyles.fill,
              {
                width: `${Math.round(effectiveVolume * 100)}%` as `${number}%`,
                backgroundColor: muted ? colors.mutedForeground : colors.primary,
              },
            ]}
          />
          {/* Thumb */}
          <View
            pointerEvents="none"
            style={[
              audioStyles.thumb,
              {
                left: `${Math.round(effectiveVolume * 100)}%` as `${number}%`,
                backgroundColor: muted ? colors.mutedForeground : colors.primary,
              },
            ]}
          />
        </View>
        <Feather name="volume-2" size={12} color={colors.mutedForeground} />
      </View>
    </View>
  );
}

const audioStyles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, marginBottom: 16, padding: 14, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconWrap: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  label: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  sublabel: { fontSize: 11 },
  muteBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  muteBtnText: { fontSize: 12, fontWeight: '700' },
  sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 10, borderRadius: 5, overflow: 'visible', position: 'relative', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 5, minWidth: 4 },
  thumb: { position: 'absolute', width: 18, height: 18, borderRadius: 9, marginLeft: -9, top: -4, borderWidth: 2, borderColor: '#fff' },
});

// ─── Stats tab content ────────────────────────────────────────────────────────
const SKILL_COLORS: Record<SkillType, string> = {
  forge: '#D4851A', extraction: '#7A7A8C', commerce: '#D4AF37',
  construction: '#8B6B3D', enchantment: '#9966CC', cooking: '#E67E22',
  harvest: '#4CAF50', combat: '#EF5350',
};

const SKILL_LABELS: Record<SkillType, string> = {
  forge: 'Forge', extraction: 'Extraction', commerce: 'Commerce',
  construction: 'Construction', enchantment: 'Enchantement', cooking: 'Cuisine',
  harvest: 'Récolte', combat: 'Combat',
};

const QUALITY_CHART_DATA: { key: string; label: string; color: string }[] = [
  { key: 'poor_normal', label: 'Ordinaire', color: '#7A7A8C' },
  { key: 'good',        label: 'Bon',       color: '#4CAF50' },
  { key: 'excellent',   label: 'Excellent',  color: '#42A5F5' },
  { key: 'legendary',   label: 'Légendaire', color: '#D4AF37' },
];

const QUALITY_COLOR: Record<string, string> = {
  poor: '#555568', normal: '#7A7A8C', good: '#4CAF50', excellent: '#42A5F5', legendary: '#D4AF37',
};

const QUALITY_LABEL_FR: Record<string, string> = {
  poor: 'Médiocre', normal: 'Ordinaire', good: 'Bon', excellent: 'Excellent', legendary: 'Légendaire',
};

const HISTORY_LIMIT = 20;

function StatsTabContent({ colors, game }: { colors: ReturnType<typeof useColors>; game: ReturnType<typeof useGame> }) {
  const { player } = game;

  // Session snapshots for sparkline
  const sessionSnapshots = useMemo(() => game.sessionSnapshots ?? [], [game.sessionSnapshots]);

  // Account age
  const createdAt = player.createdAt ?? Date.now();
  const accountAgeDays = Math.max(0, Math.floor((Date.now() - createdAt) / 86400000));
  const createdDate = new Date(createdAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

  // Estimated play time in hours/minutes
  const playTimeMs = player.totalPlayTime ?? 0;
  const playHours = Math.floor(playTimeMs / 3600000);
  const playMins = Math.floor((playTimeMs % 3600000) / 60000);
  const playTimeLabel = playHours > 0 ? `${playHours}h ${playMins}m` : `${playMins}m`;

  // Skill bars
  const maxSkillLevel = Math.max(...Object.values(player.skills));
  const skillBarMax = Math.max(maxSkillLevel, 10);
  const skillTypes: SkillType[] = ['forge', 'extraction', 'commerce', 'construction', 'enchantment', 'cooking', 'harvest', 'combat'];

  // Quality distribution
  const legendary = player.craftedLegendaryCount ?? 0;
  const excellent = player.craftedExcellentCount ?? 0;
  const good = player.craftedGoodCount ?? 0;
  const poorNormal = Math.max(0, (player.totalItemsCrafted ?? 0) - legendary - excellent - good);
  const qualityMax = Math.max(poorNormal, good, excellent, legendary, 1);
  const qualityCounts: Record<string, number> = { poor_normal: poorNormal, good, excellent, legendary };

  // Forge history — already newest-first from the reducer, just cap display
  const recentItems = useMemo(() =>
    game.forgeHistory.slice(0, HISTORY_LIMIT),
    [game.forgeHistory],
  );

  // Streak
  const streak = player.streak ?? 1;

  return (
    <>
      {/* ── Account info ── */}
      <Text style={[stStyles.sectionHeader, { color: colors.foreground }]}>COMPTE</Text>
      <View style={[stStyles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={stStyles.infoRow}>
          <Feather name="calendar" size={14} color={colors.primary} />
          <Text style={[stStyles.infoLabel, { color: colors.mutedForeground }]}>Compte créé le</Text>
          <Text style={[stStyles.infoValue, { color: colors.foreground }]}>{createdDate}</Text>
        </View>
        <View style={[stStyles.infoSep, { backgroundColor: colors.border }]} />
        <View style={stStyles.infoRow}>
          <Feather name="clock" size={14} color={colors.primary} />
          <Text style={[stStyles.infoLabel, { color: colors.mutedForeground }]}>Temps de jeu estimé</Text>
          <Text style={[stStyles.infoValue, { color: colors.foreground }]}>{playTimeLabel || '< 1m'}</Text>
        </View>
        <View style={[stStyles.infoSep, { backgroundColor: colors.border }]} />
        <View style={stStyles.infoRow}>
          <Feather name="sun" size={14} color="#D4AF37" />
          <Text style={[stStyles.infoLabel, { color: colors.mutedForeground }]}>Jours consécutifs</Text>
          <View style={stStyles.streakWrap}>
            <Text style={[stStyles.infoValue, { color: '#D4AF37' }]}>{streak}</Text>
            <Text style={[stStyles.streakFlame, { color: '#D4AF37' }]}> 🔥</Text>
          </View>
        </View>
        <View style={[stStyles.infoSep, { backgroundColor: colors.border }]} />
        <View style={stStyles.infoRow}>
          <Feather name="hash" size={14} color={colors.primary} />
          <Text style={[stStyles.infoLabel, { color: colors.mutedForeground }]}>Âge du compte</Text>
          <Text style={[stStyles.infoValue, { color: colors.foreground }]}>{accountAgeDays} jour{accountAgeDays !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* ── Level progression sparkline ── */}
      <Text style={[stStyles.sectionHeader, { color: colors.foreground }]}>ÉVOLUTION DU NIVEAU</Text>
      <LevelSparkline snapshots={sessionSnapshots} colors={colors} />

      {/* ── Skill progression chart ── */}
      <Text style={[stStyles.sectionHeader, { color: colors.foreground }]}>PAR COMPÉTENCE</Text>
      <SkillProgressChart snapshots={sessionSnapshots} colors={colors} />

      {/* ── Key records ── */}
      <Text style={[stStyles.sectionHeader, { color: colors.foreground }]}>RECORDS PERSONNELS</Text>
      <View style={stStyles.recordsRow}>
        <View style={[stStyles.recordCard, { backgroundColor: colors.card, borderColor: '#D4851A44' }]}>
          <Feather name="award" size={20} color="#D4851A" />
          <Text style={[stStyles.recordValue, { color: '#D4851A' }]}>{Math.round(player.bestQualityScore ?? 0)}</Text>
          <Text style={[stStyles.recordLabel, { color: colors.mutedForeground }]}>Score forge max</Text>
        </View>
        <View style={[stStyles.recordCard, { backgroundColor: colors.card, borderColor: '#D4AF3744' }]}>
          <Feather name="trending-up" size={20} color="#D4AF37" />
          <Text style={[stStyles.recordValue, { color: '#D4AF37' }]}>{(player.bestSalePrice ?? 0).toLocaleString()}g</Text>
          <Text style={[stStyles.recordLabel, { color: colors.mutedForeground }]}>Meilleure vente</Text>
        </View>
        <View style={[stStyles.recordCard, { backgroundColor: colors.card, borderColor: '#42A5F544' }]}>
          <Feather name="package" size={20} color="#42A5F5" />
          <Text style={[stStyles.recordValue, { color: '#42A5F5' }]}>{player.totalItemsCrafted ?? 0}</Text>
          <Text style={[stStyles.recordLabel, { color: colors.mutedForeground }]}>Objets forgés</Text>
        </View>
        <View style={[stStyles.recordCard, { backgroundColor: colors.card, borderColor: '#4CAF5044' }]}>
          <Feather name="check-circle" size={20} color="#4CAF50" />
          <Text style={[stStyles.recordValue, { color: '#4CAF50' }]}>{player.totalOrdersDelivered ?? 0}</Text>
          <Text style={[stStyles.recordLabel, { color: colors.mutedForeground }]}>Commandes livrées</Text>
        </View>
      </View>

      {/* ── Skill comparison bars ── */}
      <Text style={[stStyles.sectionHeader, { color: colors.foreground }]}>NIVEAUX DE COMPÉTENCE</Text>
      <View style={[stStyles.skillChart, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {skillTypes.map((sk) => {
          const level = player.skills[sk] ?? 1;
          const pct = (level / skillBarMax) * 100;
          const color = SKILL_COLORS[sk];
          return (
            <View key={sk} style={stStyles.skillBarRow}>
              <Text style={[stStyles.skillBarLabel, { color: colors.mutedForeground }]}>{SKILL_LABELS[sk]}</Text>
              <View style={stStyles.skillBarTrackWrap}>
                <View style={[stStyles.skillBarTrack, { backgroundColor: colors.muted }]}>
                  <View style={[stStyles.skillBarFill, { width: `${pct}%` as `${number}%`, backgroundColor: color }]} />
                </View>
              </View>
              <Text style={[stStyles.skillBarLevel, { color }]}>Niv.{level}</Text>
            </View>
          );
        })}
      </View>

      {/* ── Quality distribution chart ── */}
      <Text style={[stStyles.sectionHeader, { color: colors.foreground }]}>RÉPARTITION PAR QUALITÉ</Text>
      <View style={[stStyles.qualityChart, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {player.totalItemsCrafted === 0 ? (
          <Text style={[stStyles.emptyChart, { color: colors.mutedForeground }]}>Aucun objet forgé pour l'instant</Text>
        ) : (
          <>
            <View style={stStyles.qualityBarsWrap}>
              {QUALITY_CHART_DATA.map((q) => {
                const count = qualityCounts[q.key] ?? 0;
                const barPct = Math.max(0, (count / qualityMax) * 100);
                return (
                  <View key={q.key} style={stStyles.qualityBarCol}>
                    <Text style={[stStyles.qualityBarCount, { color: q.color }]}>{count}</Text>
                    <View style={stStyles.qualityBarTrack}>
                      <View style={[stStyles.qualityBarFill, { height: `${barPct}%` as `${number}%`, backgroundColor: q.color }]} />
                    </View>
                    <Text style={[stStyles.qualityBarLabel, { color: colors.mutedForeground }]}>{q.label}</Text>
                  </View>
                );
              })}
            </View>
            <Text style={[stStyles.qualityTotal, { color: colors.mutedForeground }]}>
              {legendary} légendaire{legendary !== 1 ? 's' : ''} · {excellent} excellent{excellent !== 1 ? 's' : ''} · {good} bon{good !== 1 ? 's' : ''}
            </Text>
          </>
        )}
      </View>

      {/* ── Forge history ── */}
      <Text style={[stStyles.sectionHeader, { color: colors.foreground }]}>HISTORIQUE DE FORGE</Text>
      {recentItems.length === 0 ? (
        <View style={[stStyles.historyEmpty, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="inbox" size={24} color={colors.mutedForeground} />
          <Text style={[stStyles.historyEmptyText, { color: colors.mutedForeground }]}>
            Forgez votre premier objet pour commencer l'historique
          </Text>
        </View>
      ) : (
        <View style={[stStyles.historyList, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {recentItems.map((entry: ForgeHistoryEntry, idx: number) => {
            const qColor = QUALITY_COLOR[entry.quality] ?? '#888';
            const dateStr = new Date(entry.craftedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
            const timeStr = new Date(entry.craftedAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            return (
              <View key={entry.instanceId}>
                {idx > 0 && <View style={[stStyles.historySep, { backgroundColor: colors.border }]} />}
                <View style={stStyles.historyRow}>
                  <View style={[stStyles.historyQualityDot, { backgroundColor: qColor }]} />
                  <View style={stStyles.historyInfo}>
                    <Text style={[stStyles.historyItemName, { color: colors.foreground }]} numberOfLines={1}>{entry.name}</Text>
                    <Text style={[stStyles.historyMeta, { color: colors.mutedForeground }]}>
                      {QUALITY_LABEL_FR[entry.quality]} · {entry.category} · {dateStr} {timeStr}
                    </Text>
                  </View>
                  <Text style={[stStyles.historyValue, { color: '#D4AF37' }]}>{entry.value.toLocaleString()}g</Text>
                </View>
              </View>
            );
          })}
          {game.forgeHistory.length > HISTORY_LIMIT && (
            <View style={[stStyles.historySep, { backgroundColor: colors.border }]} />
          )}
          {game.forgeHistory.length > HISTORY_LIMIT && (
            <Text style={[stStyles.historyMore, { color: colors.mutedForeground }]}>
              +{game.forgeHistory.length - HISTORY_LIMIT} entrée{game.forgeHistory.length - HISTORY_LIMIT > 1 ? 's' : ''} plus ancienne{game.forgeHistory.length - HISTORY_LIMIT > 1 ? 's' : ''}
            </Text>
          )}
        </View>
      )}

      {/* ── Summary grid ── */}
      <Text style={[stStyles.sectionHeader, { color: colors.foreground }]}>RÉSUMÉ</Text>
      <View style={stStyles.summaryGrid}>
        {[
          { label: 'Or total gagné', value: (player.totalGoldEarned ?? 0).toLocaleString() + 'g', icon: 'dollar-sign', color: '#D4AF37' },
          { label: 'Or en poche', value: player.gold.toLocaleString() + 'g', icon: 'credit-card', color: '#4CAF50' },
          { label: 'Niveaux cumulés', value: String(Object.values(player.skills).reduce((a, b) => a + b, 0)), icon: 'star', color: '#9966CC' },
          { label: 'Talents débloqués', value: `${player.talentsUnlocked.length}/${game.allTalents.length}`, icon: 'award', color: '#42A5F5' },
          { label: 'Niveau forgeron', value: String(player.forgeLevel), icon: 'tool', color: '#D4851A' },
          { label: 'Quêtes acceptées', value: String(player.totalQuestsAccepted ?? 0), icon: 'map', color: '#EF5350' },
        ].map((s) => (
          <View key={s.label} style={[stStyles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name={s.icon as 'tool'} size={18} color={s.color} />
            <Text style={[stStyles.summaryValue, { color: colors.foreground }]}>{s.value}</Text>
            <Text style={[stStyles.summaryLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const stStyles = StyleSheet.create({
  sectionHeader: { fontSize: 11, fontWeight: '800', letterSpacing: 2, marginBottom: 10, marginTop: 4 },
  infoCard: { borderRadius: 14, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 12 },
  infoSep: { height: 1, marginHorizontal: 14 },
  infoLabel: { flex: 1, fontSize: 13 },
  infoValue: { fontSize: 13, fontWeight: '700' },
  streakWrap: { flexDirection: 'row', alignItems: 'center' },
  streakFlame: { fontSize: 13 },
  recordsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  recordCard: { width: '47%', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, gap: 4 },
  recordValue: { fontSize: 20, fontWeight: '800' },
  recordLabel: { fontSize: 10, letterSpacing: 0.5, textAlign: 'center' },
  skillChart: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 16, gap: 10 },
  skillBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skillBarLabel: { width: 90, fontSize: 11, fontWeight: '600' },
  skillBarTrackWrap: { flex: 1 },
  skillBarTrack: { height: 8, borderRadius: 4, overflow: 'hidden' },
  skillBarFill: { height: '100%', borderRadius: 4, minWidth: 4 },
  skillBarLevel: { width: 44, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  qualityChart: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 16 },
  qualityBarsWrap: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 120, marginBottom: 8 },
  qualityBarCol: { alignItems: 'center', flex: 1, height: '100%', gap: 4 },
  qualityBarTrack: { flex: 1, width: 28, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.07)', overflow: 'hidden', justifyContent: 'flex-end' },
  qualityBarFill: { width: '100%', borderRadius: 4, minHeight: 4 },
  qualityBarCount: { fontSize: 13, fontWeight: '800' },
  qualityBarLabel: { fontSize: 10, fontWeight: '600', textAlign: 'center' },
  qualityTotal: { fontSize: 10, textAlign: 'center', marginTop: 4 },
  emptyChart: { fontSize: 12, textAlign: 'center', paddingVertical: 20 },
  historyEmpty: { borderRadius: 14, borderWidth: 1, padding: 24, alignItems: 'center', gap: 10, marginBottom: 16 },
  historyEmptyText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
  historyList: { borderRadius: 14, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 11 },
  historySep: { height: 1, marginHorizontal: 14 },
  historyQualityDot: { width: 10, height: 10, borderRadius: 5 },
  historyInfo: { flex: 1 },
  historyItemName: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  historyMeta: { fontSize: 10, lineHeight: 14 },
  historyValue: { fontSize: 13, fontWeight: '700' },
  historyMore: { fontSize: 11, textAlign: 'center', paddingVertical: 10 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  summaryCard: { width: '47%', borderRadius: 12, padding: 14, alignItems: 'center', borderWidth: 1, gap: 5 },
  summaryValue: { fontSize: 17, fontWeight: '700' },
  summaryLabel: { fontSize: 10, letterSpacing: 0.5, textAlign: 'center' },
});

// ─── Achievements tab content ─────────────────────────────────────────────────
const ACH_CATEGORY_INFO: Record<string, { label: string; color: string; icon: string }> = {
  craft:       { label: 'Forge',       color: '#D4851A', icon: 'tool' },
  economy:     { label: 'Économie',    color: '#4CAF50', icon: 'dollar-sign' },
  exploration: { label: 'Exploration', color: '#42A5F5', icon: 'compass' },
  progression: { label: 'Progression', color: '#AB47BC', icon: 'trending-up' },
  special:     { label: 'Spécial',     color: '#EF5350', icon: 'star' },
};

function AchievementsTabContent({ colors }: { colors: ReturnType<typeof useColors> }) {
  const { unlockedIds, allAchievements, totalUnlocked } = useAchievements();

  return (
    <>
      {/* Progress banner */}
      <View style={[styles.achieveHeader, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.achieveHeaderNum, { color: colors.primary }]}>{totalUnlocked}</Text>
        <Text style={[styles.achieveHeaderSep, { color: colors.mutedForeground }]}> / {allAchievements.length}</Text>
        <Text style={[styles.achieveHeaderLabel, { color: colors.mutedForeground }]}> succès débloqués</Text>
        {/* Progress bar */}
        <View style={{ flex: 1 }} />
        <View style={[styles.achieveProgress, { backgroundColor: colors.muted }]}>
          <View
            style={[
              styles.achieveProgressFill,
              {
                width: `${Math.round((totalUnlocked / allAchievements.length) * 100)}%` as `${number}%`,
                backgroundColor: colors.primary,
              },
            ]}
          />
        </View>
      </View>

      {/* Achievement rows */}
      {allAchievements.map((ach: Achievement) => {
        const unlocked = unlockedIds.has(ach.id);
        const info = ACH_CATEGORY_INFO[ach.category] ?? { label: ach.category, color: '#888', icon: 'star' };
        return (
          <View
            key={ach.id}
            style={[
              styles.achieveRow,
              {
                backgroundColor: unlocked ? colors.card : colors.background,
                borderColor: unlocked ? info.color + '44' : colors.border,
                opacity: unlocked ? 1 : 0.5,
              },
            ]}
          >
            {/* Icon */}
            <View style={[styles.achieveIconWrap, { backgroundColor: unlocked ? info.color + '22' : colors.muted }]}>
              <Feather
                name={(unlocked ? ach.icon : 'lock') as 'award'}
                size={18}
                color={unlocked ? info.color : colors.mutedForeground}
              />
            </View>
            {/* Text */}
            <View style={styles.achieveTextWrap}>
              <Text style={[styles.achieveTitle, { color: unlocked ? colors.foreground : colors.mutedForeground }]}>
                {unlocked ? ach.title : '???'}
              </Text>
              <Text style={[styles.achieveDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
                {unlocked ? ach.description : 'Succès encore verrouillé'}
              </Text>
            </View>
            {/* Category badge */}
            {unlocked && (
              <View style={[styles.achieveCategoryBadge, { backgroundColor: info.color + '22' }]}>
                <Text style={[styles.achieveCategoryText, { color: info.color }]}>{info.label}</Text>
              </View>
            )}
          </View>
        );
      })}
    </>
  );
}

// ─── Avatar presets ───────────────────────────────────────────────────────────
const AVATAR_COLORS: { color: string; label: string }[] = [
  { color: '#D4851A', label: 'Ambre' },
  { color: '#EF5350', label: 'Cramoisi' },
  { color: '#4CAF50', label: 'Émeraude' },
  { color: '#42A5F5', label: 'Saphir' },
  { color: '#9966CC', label: 'Violet' },
  { color: '#26A69A', label: 'Jade' },
  { color: '#EC407A', label: 'Rose' },
  { color: '#78909C', label: 'Acier' },
];

const AVATAR_ICONS: { icon: string | null; label: string }[] = [
  { icon: null,       label: 'Initiales' },
  { icon: 'tool',     label: 'Marteau' },
  { icon: 'shield',   label: 'Bouclier' },
  { icon: 'star',     label: 'Étoile' },
  { icon: 'zap',      label: 'Éclair' },
  { icon: 'award',    label: 'Trophée' },
  { icon: 'compass',  label: 'Boussole' },
  { icon: 'anchor',   label: 'Ancre' },
];

// ─── Avatar Illustrations ─────────────────────────────────────────────────────
export interface AvatarPreset {
  id: string;
  label: string;
  emoji: string;
  bg: string;
  accent: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: 'dwarf',    label: 'Nain',      emoji: '⚒️', bg: '#5C3317', accent: '#D4851A' },
  { id: 'elf',      label: 'Elfe',      emoji: '🏹', bg: '#1B4332', accent: '#52B788' },
  { id: 'knight',   label: 'Chevalier', emoji: '⚔️', bg: '#1A2744', accent: '#6EA8FE' },
  { id: 'merchant', label: 'Marchand',  emoji: '🪙', bg: '#4A3200', accent: '#D4AF37' },
  { id: 'mage',     label: 'Mage',      emoji: '🔮', bg: '#2D1B4E', accent: '#C084FC' },
  { id: 'warrior',  label: 'Guerrier',  emoji: '🛡️', bg: '#3B0A0A', accent: '#F87171' },
  { id: 'rogue',    label: 'Rôdeur',    emoji: '🗡️', bg: '#141A2E', accent: '#94A3B8' },
  { id: 'paladin',  label: 'Paladin',   emoji: '✨', bg: '#0C2340', accent: '#7DD3FC' },
];

// ─── AvatarDisplay ────────────────────────────────────────────────────────────
// Renders either a preset illustration or the legacy color+icon/initials avatar.
function AvatarDisplay({
  avatarImage,
  avatarColor,
  avatarIcon,
  initials,
  size,
}: {
  avatarImage?: string | null;
  avatarColor?: string;
  avatarIcon?: string | null;
  initials: string;
  size: number;
}) {
  const preset = avatarImage ? AVATAR_PRESETS.find((p) => p.id === avatarImage) : null;
  const radius = size / 2;
  if (preset) {
    return (
      <View style={{
        width: size, height: size, borderRadius: radius,
        backgroundColor: preset.bg,
        justifyContent: 'center', alignItems: 'center',
        borderWidth: 2, borderColor: preset.accent + '88',
      }}>
        <Text style={{ fontSize: size * 0.46, lineHeight: size * 0.56 }}>{preset.emoji}</Text>
      </View>
    );
  }
  return (
    <View style={{
      width: size, height: size, borderRadius: radius,
      backgroundColor: avatarColor ?? '#D4851A',
      justifyContent: 'center', alignItems: 'center',
    }}>
      {avatarIcon ? (
        <Feather name={avatarIcon as 'tool'} size={size * 0.46} color="#fff" />
      ) : (
        <Text style={{ fontSize: size * 0.38, fontWeight: '800', color: '#fff' }}>{initials}</Text>
      )}
    </View>
  );
}

// ─── Forge name suggestion pool ──────────────────────────────────────────────
const FORGE_NAME_POOL: string[] = [
  "Forge de l'Aigle", "L'Enclume d'Or", "Atelier du Coucou",
  "La Flamme Ardente", "Forge des Brumes", "L'Antre du Fer",
  "Marteau Céleste", "La Forge Royale", "Atelier de l'Ours",
  "L'Enclume Noire", "Forge du Soleil", "La Tenaille d'Argent",
  "Forge des Anciens", "L'Atelier Écarlate", "Marteau de Lune",
  "La Forge du Nord", "Feu Sacré", "L'Enclume Dorée",
  "Forge du Dragon", "Atelier des Braises", "La Forge Secrète",
  "Marteau d'Étoile", "L'Antre du Maître", "Forge du Phénix",
];

function pickSuggestions(count = 4): string[] {
  const pool = [...FORGE_NAME_POOL];
  const result: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    result.push(pool.splice(idx, 1)[0]);
  }
  return result;
}

// ─── Customize Modal ─────────────────────────────────────────────────────────
function CustomizeModal({
  visible,
  initialName,
  initialForgeName,
  initialAvatarColor,
  initialAvatarIcon,
  initialAvatarImage,
  onSave,
  onClose,
  colors,
}: {
  visible: boolean;
  initialName: string;
  initialForgeName: string;
  initialAvatarColor?: string;
  initialAvatarIcon?: string | null;
  initialAvatarImage?: string | null;
  onSave: (name: string, forgeName: string, avatarColor: string, avatarIcon: string | null, avatarImage: string | null) => void;
  onClose: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const [name, setName] = useState(initialName);
  const [forgeName, setForgeName] = useState(initialForgeName);
  const [avatarColor, setAvatarColor] = useState(initialAvatarColor ?? AVATAR_COLORS[0].color);
  const [avatarIcon, setAvatarIcon] = useState<string | null>(initialAvatarIcon ?? null);
  const [avatarImage, setAvatarImage] = useState<string | null>(initialAvatarImage ?? null);
  const nameRef = useRef(initialName);
  const forgeNameRef = useRef(initialForgeName);
  const [suggestions, setSuggestions] = useState<string[]>(() => pickSuggestions(4));

  // Sync when modal opens with fresh values
  useEffect(() => {
    if (visible) {
      setName(initialName);
      setForgeName(initialForgeName);
      setAvatarColor(initialAvatarColor ?? AVATAR_COLORS[0].color);
      setAvatarIcon(initialAvatarIcon ?? null);
      setAvatarImage(initialAvatarImage ?? null);
      nameRef.current = initialName;
      forgeNameRef.current = initialForgeName;
      setSuggestions(pickSuggestions(4));
    }
  }, [visible, initialName, initialForgeName, initialAvatarColor, initialAvatarIcon, initialAvatarImage]);

  const nameValid = name.trim().length >= 2 && name.trim().length <= 24;
  const forgeNameValid = forgeName.trim().length >= 2 && forgeName.trim().length <= 32;
  const canSave = nameValid && forgeNameValid;

  const handleSave = () => {
    if (!canSave) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onSave(name.trim(), forgeName.trim(), avatarColor, avatarIcon, avatarImage);
    onClose();
  };

  const initials = name.trim().split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={cmStyles.overlay}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={cmStyles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[cmStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[cmStyles.handle, { backgroundColor: colors.muted }]} />
            {/* Header */}
            <View style={cmStyles.header}>
              <View style={[cmStyles.headerIcon, { backgroundColor: `${colors.primary}22` }]}>
                <Feather name="edit-2" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[cmStyles.title, { color: colors.foreground }]}>Personnaliser</Text>
                <Text style={[cmStyles.subtitle, { color: colors.mutedForeground }]}>Votre identité de forgeron</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={[cmStyles.closeIcon, { backgroundColor: colors.secondary }]}>
                <Feather name="x" size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* ── Avatar preview ── */}
            <View style={cmStyles.avatarPreviewRow}>
              <AvatarDisplay
                avatarImage={avatarImage}
                avatarColor={avatarColor}
                avatarIcon={avatarIcon}
                initials={initials}
                size={56}
              />
              <View style={{ flex: 1 }}>
                <Text style={[cmStyles.avatarPreviewName, { color: colors.foreground }]} numberOfLines={1}>
                  {name.trim() || '—'}
                </Text>
                <Text style={[cmStyles.avatarPreviewForge, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {forgeName.trim() || '—'}
                </Text>
              </View>
            </View>

            {/* ── Avatar illustration picker ── */}
            <Text style={[cmStyles.fieldLabel, { color: colors.foreground, marginBottom: 8 }]}>Illustration</Text>
            <View style={cmStyles.illustrationGrid}>
              {/* "None" option — use color + icon instead */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => { setAvatarImage(null); Haptics.selectionAsync(); }}
                style={[
                  cmStyles.illustrationSwatch,
                  {
                    backgroundColor: colors.secondary,
                    borderColor: avatarImage === null ? colors.primary : colors.border,
                    borderWidth: avatarImage === null ? 2.5 : 1.5,
                  },
                ]}
              >
                <Feather name="x" size={14} color={avatarImage === null ? colors.primary : colors.mutedForeground} />
                <Text style={[cmStyles.illustrationLabel, { color: avatarImage === null ? colors.primary : colors.mutedForeground }]}>
                  Aucune
                </Text>
              </TouchableOpacity>
              {AVATAR_PRESETS.map((preset) => {
                const selected = avatarImage === preset.id;
                return (
                  <TouchableOpacity
                    key={preset.id}
                    activeOpacity={0.8}
                    onPress={() => { setAvatarImage(preset.id); Haptics.selectionAsync(); }}
                    style={[
                      cmStyles.illustrationSwatch,
                      {
                        backgroundColor: preset.bg,
                        borderColor: selected ? preset.accent : 'transparent',
                        borderWidth: selected ? 2.5 : 1.5,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 22, lineHeight: 28 }}>{preset.emoji}</Text>
                    <Text style={[cmStyles.illustrationLabel, { color: selected ? preset.accent : '#ffffff99' }]}>
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Avatar color picker (shown only when no illustration selected) ── */}
            <Text style={[cmStyles.fieldLabel, { color: avatarImage ? colors.mutedForeground : colors.foreground, marginBottom: 8, marginTop: 14 }]}>
              Couleur de l'avatar {avatarImage ? '(désactivé)' : ''}
            </Text>
            <View style={cmStyles.colorGrid}>
              {AVATAR_COLORS.map(({ color, label }) => (
                <TouchableOpacity
                  key={color}
                  activeOpacity={0.8}
                  onPress={() => { setAvatarColor(color); Haptics.selectionAsync(); }}
                  style={[
                    cmStyles.colorSwatch,
                    { backgroundColor: color },
                    avatarColor === color && cmStyles.colorSwatchSelected,
                  ]}
                >
                  {avatarColor === color && (
                    <Feather name="check" size={14} color="#fff" />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Avatar icon picker (shown only when no illustration) ── */}
            <Text style={[cmStyles.fieldLabel, { color: avatarImage ? colors.mutedForeground : colors.foreground, marginTop: 14, marginBottom: 8 }]}>
              Icône de l'avatar {avatarImage ? '(désactivé)' : ''}
            </Text>
            <View style={[cmStyles.iconGrid, { opacity: avatarImage ? 0.35 : 1 }]}>
              {AVATAR_ICONS.map(({ icon, label }) => {
                const selected = avatarIcon === icon;
                return (
                  <TouchableOpacity
                    key={String(icon)}
                    activeOpacity={0.8}
                    onPress={() => { setAvatarIcon(icon); Haptics.selectionAsync(); }}
                    style={[
                      cmStyles.iconSwatch,
                      {
                        backgroundColor: selected ? avatarColor : colors.secondary,
                        borderColor: selected ? avatarColor : colors.border,
                      },
                    ]}
                  >
                    {icon ? (
                      <Feather name={icon as 'tool'} size={16} color={selected ? '#fff' : colors.mutedForeground} />
                    ) : (
                      <Text style={[cmStyles.iconSwatchInitial, { color: selected ? '#fff' : colors.mutedForeground }]}>Aa</Text>
                    )}
                    <Text style={[cmStyles.iconSwatchLabel, { color: selected ? '#fff' : colors.mutedForeground }]} numberOfLines={1}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Nom du joueur */}
            <Text style={[cmStyles.fieldLabel, { color: colors.foreground, marginTop: 16 }]}>Nom du forgeron</Text>
            <Text style={[cmStyles.fieldHint, { color: colors.mutedForeground }]}>2 à 24 caractères</Text>
            <View style={[cmStyles.inputWrap, { borderColor: nameValid ? colors.primary : name.trim().length > 0 ? '#EF5350' : colors.border, backgroundColor: colors.secondary }]}>
              <Feather name="user" size={16} color={nameValid ? colors.primary : colors.mutedForeground} style={{ marginRight: 8 }} />
              <TextInput
                value={name}
                onChangeText={setName}
                maxLength={24}
                placeholder="Votre nom…"
                placeholderTextColor={colors.mutedForeground}
                style={[cmStyles.input, { color: colors.foreground }]}
                autoCapitalize="words"
                returnKeyType="next"
              />
              <Text style={[cmStyles.charCount, { color: name.trim().length > 24 ? '#EF5350' : colors.mutedForeground }]}>
                {name.trim().length}/24
              </Text>
            </View>

            {/* Nom de la forge */}
            <Text style={[cmStyles.fieldLabel, { color: colors.foreground, marginTop: 14 }]}>Nom de la forge</Text>
            <Text style={[cmStyles.fieldHint, { color: colors.mutedForeground }]}>2 à 32 caractères</Text>
            <View style={[cmStyles.inputWrap, { borderColor: forgeNameValid ? colors.primary : forgeName.trim().length > 0 ? '#EF5350' : colors.border, backgroundColor: colors.secondary }]}>
              <Feather name="tool" size={16} color={forgeNameValid ? colors.primary : colors.mutedForeground} style={{ marginRight: 8 }} />
              <TextInput
                value={forgeName}
                onChangeText={setForgeName}
                maxLength={32}
                placeholder="Le nom de votre forge…"
                placeholderTextColor={colors.mutedForeground}
                style={[cmStyles.input, { color: colors.foreground }]}
                autoCapitalize="words"
                returnKeyType="done"
                onSubmitEditing={handleSave}
              />
              <Text style={[cmStyles.charCount, { color: forgeName.trim().length > 32 ? '#EF5350' : colors.mutedForeground }]}>
                {forgeName.trim().length}/32
              </Text>
            </View>

            {/* Forge name suggestions */}
            <View style={cmStyles.suggestionsRow}>
              {suggestions.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[cmStyles.suggestionChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                  onPress={() => {
                    setForgeName(s);
                    Haptics.selectionAsync();
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={[cmStyles.suggestionText, { color: colors.mutedForeground }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Actions */}
            <View style={cmStyles.actions}>
              <TouchableOpacity
                style={[cmStyles.cancelBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                onPress={onClose}
              >
                <Text style={[cmStyles.cancelText, { color: colors.mutedForeground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[cmStyles.saveBtn, { backgroundColor: canSave ? colors.primary : colors.muted, opacity: canSave ? 1 : 0.5 }]}
                onPress={handleSave}
                disabled={!canSave}
              >
                <Feather name="check" size={16} color={canSave ? '#fff' : colors.mutedForeground} />
                <Text style={[cmStyles.saveText, { color: canSave ? '#fff' : colors.mutedForeground }]}>Enregistrer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const cmStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  scrollContent: { justifyContent: 'flex-end', flexGrow: 1 },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40, borderWidth: 1, borderBottomWidth: 0 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  headerIcon: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  closeIcon: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  // Avatar preview row
  avatarPreviewRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18, padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.04)' },
  avatarPreviewCircle: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  avatarPreviewInitials: { fontSize: 22, fontWeight: '800', color: '#fff' },
  avatarPreviewName: { fontSize: 16, fontWeight: '700', marginBottom: 2 },
  avatarPreviewForge: { fontSize: 11 },
  // Illustration picker
  illustrationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  illustrationSwatch: { width: 72, height: 62, borderRadius: 12, justifyContent: 'center', alignItems: 'center', gap: 2 },
  illustrationLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.3 },
  // Color picker
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  colorSwatch: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  colorSwatchSelected: { borderWidth: 3, borderColor: '#fff' },
  // Icon picker
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  iconSwatch: { width: 64, height: 54, borderRadius: 12, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center', gap: 4 },
  iconSwatchInitial: { fontSize: 14, fontWeight: '700' },
  iconSwatchLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 0.3 },
  // Fields
  fieldLabel: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  fieldHint: { fontSize: 10, marginBottom: 8 },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 12 },
  input: { flex: 1, fontSize: 15, fontWeight: '500' },
  charCount: { fontSize: 10, fontWeight: '600', marginLeft: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 20 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  cancelText: { fontSize: 14, fontWeight: '600' },
  saveBtn: { flex: 2, flexDirection: 'row', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8 },
  saveText: { fontSize: 14, fontWeight: '700' },
  suggestionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  suggestionChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  suggestionText: { fontSize: 12, fontWeight: '600' },
});

// ─── Main Profile Screen ──────────────────────────────────────────────────────
export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const game = useGame();
  const headerTopPad = Platform.OS === 'web' ? 67 : insets.top;
  const [activeTab, setActiveTab] = useState<'skills' | 'talents' | 'stats' | 'achievements'>('skills');
  const [selectedSkillId, setSelectedSkillId] = useState<SkillType | null>(null);
  const [selectedTree, setSelectedTree] = useState<TreeKey>('forge');
  const [showCustomize, setShowCustomize] = useState(false);
  const hasPromptedRef = useRef(false);

  // Auto-prompt customization on first session (name still at default)
  useEffect(() => {
    if (!game.isLoaded) return;
    if (hasPromptedRef.current) return;
    if (game.player.name === 'Apprenti Forgeron') {
      hasPromptedRef.current = true;
      setShowCustomize(true);
    }
  }, [game.isLoaded, game.player.name]);

  if (!game.isLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const { player } = game;
  const initials = player.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
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
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.secondary }]}
            onPress={async () => { await game.syncToCloud(); }}
          >
            <Feather
              name={game.cloudSyncStatus === 'syncing' ? 'loader' : game.cloudSyncStatus === 'success' ? 'cloud' : game.cloudSyncStatus === 'error' ? 'cloud-off' : 'cloud'}
              size={14}
              color={game.cloudSyncStatus === 'success' ? '#4CAF50' : game.cloudSyncStatus === 'error' ? '#EF5350' : colors.accent}
            />
            <Text style={[styles.saveBtnText, { color: colors.accent }]}>Cloud</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.secondary }]} onPress={handleSave}>
            <Feather name="save" size={14} color={colors.accent} />
            <Text style={[styles.saveBtnText, { color: colors.accent }]}>Sauvegarder</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

      {/* Player card */}
      <LinearGradient
        colors={['#2A1A0A', '#1A0E18']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.playerCard, { borderColor: colors.border }]}
      >
        <View style={styles.playerCardTop}>
          <AvatarDisplay
            avatarImage={player.avatarImage}
            avatarColor={player.avatarColor ?? colors.primary}
            avatarIcon={player.avatarIcon}
            initials={initials}
            size={52}
          />
          <View style={styles.playerInfo}>
            <Text style={[styles.playerName, { color: colors.foreground }]}>{player.name}</Text>
            <Text style={[styles.playerTitle, { color: colors.primary }]}>
              {player.forgeLevel >= 8 ? 'Maître Forgeron' : player.forgeLevel >= 5 ? 'Forgeron Confirmé' : player.forgeLevel >= 3 ? 'Forgeron' : 'Apprenti Forgeron'}
            </Text>
            <Text style={[styles.playerSub, { color: colors.mutedForeground }]}>
              {player.forgeName ?? 'La Forge du Débutant'} · Niv.{player.forgeLevel}
            </Text>
          </View>
          <View style={{ alignItems: 'center', gap: 6 }}>
            <View style={[styles.levelCircle, { borderColor: colors.primary }]}>
              <Text style={[styles.levelNumber, { color: colors.accent }]}>{player.level}</Text>
              <Text style={[styles.levelLabel, { color: colors.mutedForeground }]}>NIV</Text>
            </View>
            <TouchableOpacity
              style={[styles.customizeBtn, { backgroundColor: `${colors.primary}22`, borderColor: `${colors.primary}44` }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowCustomize(true); }}
            >
              <Feather name="edit-2" size={11} color={colors.primary} />
              <Text style={[styles.customizeBtnText, { color: colors.primary }]}>Modifier</Text>
            </TouchableOpacity>
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
        {(['skills', 'talents', 'achievements', 'stats'] as const).map((tab) => {
          const labels = { skills: 'Compétences', talents: 'Talents', achievements: 'Succès', stats: 'Stats' };
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
                {player.talentPoints === 0 ? 'Points de talent (1 point gagné à chaque niveau joueur)' : `Point${player.talentPoints > 1 ? 's' : ''} de talent disponible${player.talentPoints > 1 ? 's' : ''}`}
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

        {/* ── Achievements tab ── */}
        {activeTab === 'achievements' && <AchievementsTabContent colors={colors} />}

        {/* ── Stats tab ── */}
        {activeTab === 'stats' && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>AUDIO</Text>
            <AudioSettingsCard colors={colors} />
            <StatsTabContent colors={colors} game={game} />
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

      {/* Customize modal */}
      <CustomizeModal
        visible={showCustomize}
        initialName={player.name}
        initialForgeName={player.forgeName ?? 'La Forge du Débutant'}
        initialAvatarColor={player.avatarColor}
        initialAvatarIcon={player.avatarIcon}
        initialAvatarImage={player.avatarImage}
        onSave={(name, forgeName, avatarColor, avatarIcon, avatarImage) => game.customizePlayer(name, forgeName, avatarColor, avatarIcon, avatarImage)}
        onClose={() => setShowCustomize(false)}
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
  customizeBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  customizeBtnText: { fontSize: 10, fontWeight: '700' },
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
  // Achievements
  achieveHeader: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 12 },
  achieveHeaderNum: { fontSize: 22, fontWeight: '800' },
  achieveHeaderSep: { fontSize: 16, fontWeight: '600' },
  achieveHeaderLabel: { fontSize: 12 },
  achieveProgress: { width: 60, height: 6, borderRadius: 3, overflow: 'hidden' },
  achieveProgressFill: { height: '100%', borderRadius: 3 },
  achieveRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8, gap: 10 },
  achieveIconWrap: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  achieveTextWrap: { flex: 1, gap: 2 },
  achieveTitle: { fontSize: 13, fontWeight: '700' },
  achieveDesc: { fontSize: 10, lineHeight: 14 },
  achieveCategoryBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  achieveCategoryText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
});
