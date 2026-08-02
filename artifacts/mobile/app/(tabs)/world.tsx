/**
 * World Screen — Fantasy map with 10 regions, fog of war, day/night cycle,
 * per-node resource collection with cooldowns, and exploration tracking.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
  FadeInDown,
} from 'react-native-reanimated';
import { useGame } from '@/context/GameContext';
import { useColors } from '@/hooks/useColors';
import AudioManager from '@/utils/AudioManager';
import type { ActiveHideout, CraftOrder, RegionData, RegionEnemy, RegionResourceNode } from '@/types/game';
import GuildeSection from '@/components/GuildeSection';
import WorkerReturnModal, { type WorkerReturnEntry } from '@/components/WorkerReturnModal';
import { computeWorkerHarvest, MIN_RECAP_MS } from '@/data/workers';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Quick-collect progressive cooldown ──────────────────────────────────────
/** Cooldown in seconds for each successive use. Stays at 300 s after step 4. */
const QC_STEPS    = [25, 50, 100, 150, 300];
/** After 10 min idle the step resets to 0 so the player starts fresh. */
const QC_RESET_S  = 600;
const QC_KEY_STEP = '@fk_qc_step';
const QC_KEY_LAST = '@fk_qc_last';
const QC_KEY_COOL = '@fk_qc_cool';

// ─── Region metadata ──────────────────────────────────────────────────────────
const REGION_COLORS: Record<string, string> = {
  village: '#4CAF50', forest: '#2E7D32', mountains: '#546E7A',
  mines: '#78909C', swamp: '#558B2F', desert: '#F9A825',
  ruins: '#6D4C41', port: '#0277BD', volcano: '#BF360C', castle: '#9C27B0',
  dragon_lair: '#D50000',
};

const REGION_ICONS: Record<string, any> = {
  village: 'home-group', forest: 'pine-tree', mountains: 'summit', mines: 'pickaxe',
  swamp: 'water', desert: 'cactus', ruins: 'pillar', port: 'anchor',
  volcano: 'volcano', castle: 'castle', dragon_lair: 'fire',
};

// Map positions as fractions of map container width/height
const REGION_POSITIONS: Record<string, { x: number; y: number }> = {
  dragon_lair: { x: 0.78, y: 0.05 },
  castle: { x: 0.50, y: 0.09 },
  ruins: { x: 0.22, y: 0.20 },
  volcano: { x: 0.78, y: 0.22 },
  mountains: { x: 0.14, y: 0.42 },
  mines: { x: 0.44, y: 0.44 },
  desert: { x: 0.76, y: 0.46 },
  forest: { x: 0.20, y: 0.65 },
  swamp: { x: 0.40, y: 0.70 },
  village: { x: 0.58, y: 0.72 },
  port: { x: 0.83, y: 0.68 },
};

// Region road connections (pairs)
const CONNECTIONS: [string, string][] = [
  ['village', 'forest'], ['village', 'swamp'], ['village', 'mines'],
  ['village', 'port'], ['mines', 'mountains'], ['mines', 'ruins'],
  ['mines', 'desert'], ['desert', 'port'], ['desert', 'volcano'],
  ['mountains', 'ruins'], ['ruins', 'castle'], ['volcano', 'castle'],
  ['mountains', 'castle'], ['swamp', 'forest'],
  ['volcano', 'dragon_lair'], ['castle', 'dragon_lair'],
];

// ─── Day / Night ─────────────────────────────────────────────────────────────
type DayPhase = 'night' | 'dawn' | 'day' | 'dusk';

function getPhase(hour: number): DayPhase {
  if (hour < 5 || hour >= 22) return 'night';
  if (hour < 7) return 'dawn';
  if (hour < 18) return 'day';
  return 'dusk';
}

const PHASE_CONFIG: Record<DayPhase, { label: string; icon: any; tint: string }> = {
  night: { label: 'Nuit', icon: 'moon-waning-crescent', tint: 'rgba(10,8,20,0.65)' },
  dawn: { label: 'Aube', icon: 'weather-sunset-up', tint: 'rgba(60,25,10,0.35)' },
  day: { label: 'Jour', icon: 'weather-sunny', tint: 'rgba(0,0,0,0)' },
  dusk: { label: 'Crépuscule', icon: 'weather-sunset-down', tint: 'rgba(40,15,5,0.45)' },
};

// Resource rarity → cooldown (ms)
const RARITY_COOLDOWN: Record<string, number> = {
  legendary: 300000, epic: 180000, rare: 90000, uncommon: 45000, common: 20000,
};

// ─── Map connecting line ──────────────────────────────────────────────────────
function MapLine({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  return (
    <View
      style={{
        position: 'absolute',
        left: cx - len / 2,
        top: cy - 1,
        width: len,
        height: 2,
        backgroundColor: color,
        opacity: 0.28,
        transform: [{ rotate: `${angle}deg` }],
      }}
    />
  );
}

function useLoreToast(lore: string[] | undefined) {
  const [toastText, setToastText] = useState<string | null>(null);
  const opacity = useSharedValue(0);
  const toastStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const loreRef = useRef(lore);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loreRef.current = lore; }, [lore]);

  useEffect(() => {
    const schedule = () => {
      if (!loreRef.current || loreRef.current.length === 0) return;
      const delay = 30_000 + Math.floor(Math.random() * 60_001);
      timerRef.current = setTimeout(() => {
        const texts = loreRef.current!;
        const text = texts[Math.floor(Math.random() * texts.length)];
        setToastText(text);
        opacity.value = withTiming(1, { duration: 500 });
        hideRef.current = setTimeout(() => {
          opacity.value = withTiming(0, { duration: 600 });
          timerRef.current = setTimeout(schedule, 700);
        }, 6_000);
      }, delay);
    };
    schedule();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (hideRef.current) clearTimeout(hideRef.current);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { toastText, toastStyle };
}
function RegionNode({
  region, isUnlocked, canUnlock, exploration, x, y, nodeSize, onPress, colors,
}: {
  region: RegionData; isUnlocked: boolean; canUnlock: boolean;
  exploration: number; x: number; y: number; nodeSize: number;
  onPress: () => void; colors: ReturnType<typeof useColors>;
}) {
  const rc = REGION_COLORS[region.id] ?? colors.primary;
  const half = nodeSize / 2;
  return (
    <Pressable
      style={[styles.regionNode, { left: x - half, top: y - half, width: nodeSize, height: nodeSize }]}
      onPress={onPress}
    >
      {/* Glow ring for unlocked */}
      {isUnlocked && (
        <View style={[styles.regionGlow, { borderColor: rc + '60', width: nodeSize + 10, height: nodeSize + 10, borderRadius: (nodeSize + 10) / 2, left: -5, top: -5 }]} />
      )}
      {/* Main circle */}
      <View style={[styles.regionCircle, {
        width: nodeSize, height: nodeSize, borderRadius: half,
        backgroundColor: isUnlocked ? rc + '33' : '#1A0E08',
        borderColor: isUnlocked ? rc : colors.border,
        borderWidth: isUnlocked ? 2 : 1,
      }]}>
        {isUnlocked ? (
          <MaterialCommunityIcons name={REGION_ICONS[region.id] ?? 'map-marker'} size={nodeSize * 0.42} color="#F2E4C4" />
        ) : (
          <MaterialCommunityIcons name="lock" size={nodeSize * 0.35} color={canUnlock ? colors.accent : colors.mutedForeground} />
        )}
      </View>
      {/* Exploration ring */}
      {isUnlocked && exploration > 0 && (
        <View style={[styles.expRing, { width: nodeSize - 4, height: 3, backgroundColor: colors.muted, borderRadius: 2, top: nodeSize + 3 }]}>
          <View style={{ width: `${exploration}%` as `${number}%`, height: '100%', backgroundColor: rc, borderRadius: 2 }} />
        </View>
      )}
      {/* Name */}
      <Text
        style={[styles.regionNodeName, {
          color: isUnlocked ? '#F2E4C4' : colors.mutedForeground,
          top: nodeSize + 8,
          maxWidth: nodeSize + 30,
        }]}
        numberOfLines={1}
      >
        {isUnlocked ? region.name : `Niv.${region.levelRequired}`}
      </Text>
      {/* Fog overlay */}
      {!isUnlocked && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(8,4,16,0.65)', borderRadius: half }]} />
      )}
    </Pressable>
  );
}

// ─── Exploration view (per-node collection) ───────────────────────────────────
function ExploreView({
  region, onBack, colors, insets,
}: {
  region: RegionData; onBack: () => void;
  colors: ReturnType<typeof useColors>; insets: ReturnType<typeof useSafeAreaInsets>;
}) {
  const game = useGame();
  const { toastText: loreText, toastStyle: loreStyle } = useLoreToast(region.lore);
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [collecting, setCollecting] = useState<string | null>(null);
  const [lastDrops, setLastDrops] = useState<{ resourceId: string; qty: number } | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [showCombat, setShowCombat] = useState(false);
  const [combatEnemy, setCombatEnemy] = useState<RegionEnemy | null>(null);
  const [combatRound, setCombatRound] = useState(0);
  const [combatPlayerScore, setCombatPlayerScore] = useState(0);
  const [combatEnemyScore, setCombatEnemyScore] = useState(0);
  const [combatLastRoll, setCombatLastRoll] = useState<{ player: number; enemy: number } | null>(null);
  const [combatResult, setCombatResult] = useState<ReturnType<typeof game.fightForMaterials> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const progress = useSharedValue(0);
  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.round(progress.value * 100)}%` as `${number}%`,
  }));
  const toastOpacity = useSharedValue(0);
  const toastStyle = useAnimatedStyle(() => ({ opacity: toastOpacity.value }));

  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 96;
  const rc = REGION_COLORS[region.id] ?? colors.primary;

  // Compute current inventory weight
  const currentWeight = useMemo(() => {
    return game.inventory.reduce((acc, inv) => {
      const res = game.getResourceById(inv.resourceId);
      return acc + (res?.weight ?? 0) * inv.quantity;
    }, 0) + game.craftedItems.reduce((a, b) => a + b.weight, 0);
  }, [game.inventory, game.craftedItems, game.getResourceById]);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const doCollect = useCallback((node: RegionResourceNode, key: string) => {
    const res = game.getResourceById(node.resourceId);
    const resWeight = res?.weight ?? 0;
    const rarity = res?.rarity ?? 'common';

    // Always clear collecting UI state first — prevents lock on any code path
    setCollecting(null);
    progress.value = 0;

    // Roll the raw quantity (0 = miss)
    const rolled = Math.random() < node.dropRate
      ? Math.floor(Math.random() * (node.maxQty - node.minQty + 1) + node.minQty)
      : 0;

    // Determine how many units actually fit in the remaining capacity
    const remaining = game.maxWeight - currentWeight;
    const maxQtyByWeight = resWeight > 0 ? Math.floor(remaining / resWeight) : rolled;

    if (rolled > 0 && maxQtyByWeight <= 0) {
      // Inventory genuinely full — hard fail, short cooldown, no XP
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      AudioManager.playError();
      setLastDrops(null);
      showDrop(null);
      setCooldowns((prev) => ({ ...prev, [key]: Date.now() + Math.round((RARITY_COOLDOWN[rarity] ?? 20000) / 4) }));
      return;
    }

    // Collect up to what fits (may be less than rolled on partial capacity)
    const finalQty = rolled > 0 ? Math.min(rolled, maxQtyByWeight) : 0;
    if (finalQty > 0) {
      game.harvestResource(node.resourceId, finalQty);
      setLastDrops({ resourceId: node.resourceId, qty: finalQty });
      AudioManager.playCollect();
    } else {
      AudioManager.playError(); // miss (rolled === 0)
      setLastDrops(null);
    }

    // XP & exploration — always awarded when attempt completes normally
    game.addSkillXP('harvest', 3);
    game.addPlayerXP(2);
    game.addExploration(region.id, Math.floor(Math.random() * 3) + 1);

    // Full cooldown
    const cd = RARITY_COOLDOWN[rarity] ?? 20000;
    setCooldowns((prev) => ({ ...prev, [key]: Date.now() + cd }));

    showDrop(null);
  }, [currentWeight, game, region.id, progress]); // eslint-disable-line react-hooks/exhaustive-deps

  const showDrop = (drop: { resourceId: string; qty: number } | null) => {
    setShowToast(true);
    toastOpacity.value = 1;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      toastOpacity.value = withTiming(0, { duration: 600 });
      setTimeout(() => setShowToast(false), 600);
    }, 2200);
  };

  const handleNodeTap = (node: RegionResourceNode) => {
    const key = `${region.id}_${node.resourceId}`;
    if (collecting) return;
    if (cooldowns[key] && now < cooldowns[key]) return;

    setCollecting(key);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    progress.value = 0;
    progress.value = withTiming(1, { duration: 2200, easing: Easing.linear }, (finished) => {
      if (finished) runOnJS(doCollect)(node, key);
    });
  };

  const openCombat = (enemy: RegionEnemy | null = null) => {
    setCombatEnemy(enemy);
    setCombatRound(0);
    setCombatPlayerScore(0);
    setCombatEnemyScore(0);
    setCombatLastRoll(null);
    setCombatResult(null);
    setShowCombat(true);
  };

  const rollCombatDice = () => {
    if (combatResult) return;
    const playerRoll = Math.floor(Math.random() * 6) + 1 + Math.floor((game.player.skills.combat ?? 1) / 5);
    const enemyLevel = combatEnemy ? combatEnemy.level : region.boss.level;
    const enemyRoll = Math.floor(Math.random() * 6) + 1 + Math.floor(enemyLevel / 5);
    const nextPlayerScore = combatPlayerScore + playerRoll;
    const nextEnemyScore = combatEnemyScore + enemyRoll;
    const nextRound = combatRound + 1;
    setCombatLastRoll({ player: playerRoll, enemy: enemyRoll });
    setCombatPlayerScore(nextPlayerScore);
    setCombatEnemyScore(nextEnemyScore);
    setCombatRound(nextRound);
    // Dice roll sound, then win/lose feedback after a short delay
    AudioManager.playDiceRoll();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setTimeout(() => {
      if (playerRoll > enemyRoll) {
        AudioManager.playHammerStrike();
      } else {
        AudioManager.playError();
      }
    }, 120);
    if (nextRound >= 3) {
      const result = game.fightForMaterials(region.id, nextPlayerScore, nextEnemyScore, combatEnemy?.id);
      setCombatResult(result);
      if (result.won) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        // Victory fanfare plays after the last hammer-strike sound (120 ms) settles
        setTimeout(() => {
          AudioManager.playVictory();
        }, 200);
        if (result.drops.length > 0) {
          setTimeout(() => {
            AudioManager.playCollect();
          }, 900);
        }
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={[colors.card as string, 'transparent']}
        style={[styles.exploreHeader, { paddingTop: (Platform.OS === 'web' ? 67 : insets.top) + 10 }]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={onBack}>
          <Feather name="arrow-left" size={20} color={colors.primary} />
        </TouchableOpacity>
        <View style={styles.exploreHeaderCenter}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(200,140,60,0.15)', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: 'rgba(200,140,60,0.4)' }}>
            <MaterialCommunityIcons name={REGION_ICONS[region.id] ?? 'map-marker'} size={24} color="#F2E4C4" />
          </View>
          <View>
            <Text style={[styles.exploreTitle, { color: colors.foreground }]}>{region.name}</Text>
            <Text style={[styles.exploreSubtitle, { color: colors.mutedForeground }]}>
              {region.biome} · Exploration {game.regionExploration[region.id] ?? 0}%
            </Text>
          </View>
        </View>
        <View style={[styles.levelBadge, { backgroundColor: rc + '28', borderColor: rc + '60' }]}>
          <Text style={[styles.levelBadgeText, { color: rc }]}>Niv.{region.levelRequired}+</Text>
        </View>
      </LinearGradient>

      {/* Exploration progress */}
      <View style={[styles.exploreProgress, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Text style={[styles.expLabel, { color: colors.mutedForeground }]}>Exploration</Text>
        <View style={[styles.expTrack, { backgroundColor: colors.muted }]}>
          <View style={[styles.expFill, { width: `${game.regionExploration[region.id] ?? 0}%` as `${number}%`, backgroundColor: rc }]} />
        </View>
        <Text style={[styles.expPct, { color: rc }]}>{game.regionExploration[region.id] ?? 0}%</Text>
      </View>

      {/* Boss info strip */}
      <LinearGradient colors={['rgba(183, 28, 28, 0.15)', 'rgba(183, 28, 28, 0.05)']} style={[styles.bossStrip, { borderBottomColor: colors.destructive + '40' }]}>
        <MaterialCommunityIcons name="skull" size={16} color={colors.destructive} />
        <Text style={[styles.bossStripText, { color: colors.destructive, flex: 1 }]}>
          Boss: {region.boss.name} · Niv.{region.boss.level}
        </Text>
        <TouchableOpacity style={[styles.fightBtn, { backgroundColor: colors.destructive }]} onPress={() => openCombat(null)}>
          <MaterialCommunityIcons name="sword-cross" size={14} color="#fff" />
          <Text style={styles.fightBtnText}>Combattre</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Secondary enemies strip */}
      {region.enemies && region.enemies.length > 0 && (
        <View style={[styles.enemiesStrip, { backgroundColor: colors.card + 'CC', borderBottomColor: colors.border }]}>
          <Text style={[styles.enemiesLabel, { color: colors.mutedForeground }]}>GARDES</Text>
          {region.enemies.map((enemy) => (
            <TouchableOpacity
              key={enemy.id}
              style={[styles.enemyRow, { borderColor: colors.border }]}
              onPress={() => openCombat(enemy)}
            >
              <MaterialCommunityIcons name="shield-sword" size={14} color="#FF6F00" />
              <Text style={[styles.enemyRowName, { color: colors.foreground }]}>{enemy.name}</Text>
              <Text style={[styles.enemyRowLevel, { color: '#FF6F00' }]}>Niv.{enemy.level}</Text>
              <View style={[styles.fightBtn, { backgroundColor: '#FF6F00' }]}>
                <MaterialCommunityIcons name="sword-cross" size={12} color="#fff" />
                <Text style={styles.fightBtnText}>Attaquer</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Resource nodes */}
      <ScrollView
        contentContainerStyle={[styles.nodesContent, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.nodesTitle, { color: colors.primary }]}>POINTS DE RESSOURCES</Text>
        {region.resourceNodes.map((node, idx) => {
          const key = `${region.id}_${node.resourceId}`;
          const res = game.getResourceById(node.resourceId);
          const cdEnd = cooldowns[key] ?? 0;
          const isOnCd = now < cdEnd;
          const isCollecting = collecting === key;
          const cdRemaining = Math.ceil((cdEnd - now) / 1000);
          const cdMin = Math.floor(cdRemaining / 60);
          const cdSec = cdRemaining % 60;
          const hasQty = game.getInventoryQty(node.resourceId);
          return (
            <Animated.View key={node.resourceId} entering={FadeInDown.delay(Math.min(idx * 40, 400)).springify()}>
            <LinearGradient
              colors={['rgba(30,25,20,0.9)', 'rgba(15,12,10,0.95)']}
              style={[
                styles.nodeCard,
                {
                  borderColor: isCollecting ? rc : isOnCd ? colors.muted : 'rgba(200,140,60,0.3)',
                  borderWidth: isCollecting ? 1.5 : 1,
                },
              ]}
            >
              {/* Node top row */}
              <View style={styles.nodeTop}>
                <View style={[styles.nodeDot, { backgroundColor: res?.color ?? colors.primary }]} />
                <View style={styles.nodeInfo}>
                  <Text style={[styles.nodeName, { color: colors.foreground }]}>
                    {res?.name ?? node.resourceId}
                  </Text>
                  <Text style={[styles.nodeMeta, { color: colors.mutedForeground }]}>
                    {Math.round(node.dropRate * 100)}% drop · {node.minQty}–{node.maxQty} unités · {res?.weight}kg
                  </Text>
                  {hasQty > 0 && (
                    <Text style={[styles.nodeInv, { color: colors.accent }]}>
                      En stock: {hasQty}
                    </Text>
                  )}
                </View>
                <TouchableOpacity
                  style={[
                    styles.collectBtn,
                    {
                      backgroundColor: isCollecting || isOnCd ? colors.muted : rc,
                    },
                  ]}
                  onPress={() => handleNodeTap(node)}
                  disabled={isCollecting || !!collecting || isOnCd}
                  activeOpacity={0.8}
                >
                  {isOnCd ? (
                    <Text style={[styles.collectBtnText, { color: colors.mutedForeground, fontSize: 10 }]}>
                      {cdMin > 0 ? `${cdMin}m` : `${cdSec}s`}
                    </Text>
                  ) : (
                    <Feather name="crosshair" size={16} color={isCollecting || !!collecting ? colors.mutedForeground : '#fff'} />
                  )}
                </TouchableOpacity>
              </View>

              {/* Progress bar (only when collecting this node) */}
              {isCollecting && (
                <View style={[styles.progressTrack, { backgroundColor: colors.muted }]}>
                  <Animated.View style={[styles.progressFill, progressStyle, { backgroundColor: rc }]} />
                </View>
              )}
            </LinearGradient>
            </Animated.View>
          );
        })}

        {/* Description */}
        <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.descLabel, { color: colors.primary }]}>À PROPOS</Text>
          <Text style={[styles.descText, { color: colors.mutedForeground }]}>{region.description}</Text>
        </View>

        {/* Region Quests */}
        {(() => {
          const regionQuests = game.allQuests.filter(
            (q) => q.regionId === region.id && (q.unlockLevel ?? 0) <= game.player.level,
          );
          if (regionQuests.length === 0) return null;
          return (
            <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: rc + '44', marginTop: 10 }]}>
              <Text style={[styles.descLabel, { color: rc }]}>QUÊTES DE ZONE</Text>
              {regionQuests.map((quest) => {
                const isActive = game.activeQuestIds.includes(quest.id);
                const isDone = game.completedQuestIds.includes(quest.id);
                const progress = game.questProgress[quest.id] ?? {};
                return (
                  <View
                    key={quest.id}
                    style={[
                      styles.zoneQuestRow,
                      {
                        borderColor: isDone ? '#4CAF5066' : isActive ? rc + '66' : colors.border,
                        backgroundColor: isDone ? '#4CAF5012' : isActive ? rc + '18' : colors.secondary,
                      },
                    ]}
                  >
                    <View style={styles.zoneQuestTop}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.zoneQuestTitle, { color: isDone ? '#4CAF50' : colors.foreground }]}>
                          {quest.title}
                        </Text>
                        {!isDone && (
                          <Text style={[styles.zoneQuestDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
                            {quest.description}
                          </Text>
                        )}
                      </View>
                      {isDone ? (
                        <Feather name="check-circle" size={17} color="#4CAF50" />
                      ) : !isActive ? (
                        <TouchableOpacity
                          style={[styles.zoneAcceptBtn, { backgroundColor: rc }]}
                          onPress={() => { game.acceptQuest(quest.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.zoneAcceptText, { color: '#fff' }]}>Accepter</Text>
                        </TouchableOpacity>
                      ) : (
                        <View style={[styles.zoneActiveBadge, { backgroundColor: rc + '28', borderColor: rc + '55' }]}>
                          <Text style={[styles.zoneActiveBadgeText, { color: rc }]}>EN COURS</Text>
                        </View>
                      )}
                    </View>
                    {/* Objective progress bars for active quests */}
                    {isActive && !isDone && quest.objectives.map((obj) => {
                      const cur = progress[obj.id] ?? 0;
                      const pct = Math.min(100, Math.floor((cur / obj.required) * 100));
                      return (
                        <View key={obj.id} style={styles.zoneObjRow}>
                          <Text style={[styles.zoneObjText, { color: colors.mutedForeground }]} numberOfLines={1}>
                            {obj.description}
                          </Text>
                          <Text style={[styles.zoneObjCount, { color: rc }]}>{cur}/{obj.required}</Text>
                          <View style={[styles.zoneObjTrack, { backgroundColor: colors.muted }]}>
                            <View style={[styles.zoneObjFill, { width: `${pct}%` as `${number}%`, backgroundColor: rc }]} />
                          </View>
                        </View>
                      );
                    })}
                    {/* Rewards */}
                    {!isDone && (
                      <View style={styles.zoneRewards}>
                        <MaterialCommunityIcons name="gold" size={12} color="#C9A227" />
                        <Text style={[styles.zoneRewardText, { color: '#C9A227' }]}>{quest.rewards.gold}</Text>
                        <MaterialCommunityIcons name="star-circle" size={12} color={colors.accent} style={{ marginLeft: 8 }} />
                        <Text style={[styles.zoneRewardText, { color: colors.accent }]}>{quest.rewards.xp} XP</Text>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })()}
      </ScrollView>

      {/* Lore toast */}
      {loreText && (
        <Animated.View style={[styles.loreToast, loreStyle]} pointerEvents="none">
          <MaterialCommunityIcons name="book-open-variant" size={13} color="#D4851A" style={{ marginRight: 6 }} />
          <Text style={[styles.loreToastText, { color: '#F2E4C4' }]} numberOfLines={3}>{loreText}</Text>
        </Animated.View>
      )}

      {/* Weight bar */}
      <View style={[styles.weightBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <MaterialCommunityIcons name="weight" size={14} color={colors.mutedForeground} />
        <View style={[styles.weightTrack, { backgroundColor: colors.muted }]}>
          <View style={[styles.weightFill, {
            width: `${Math.min(100, Math.round((currentWeight / game.maxWeight) * 100))}%` as `${number}%`,
            backgroundColor: currentWeight / game.maxWeight > 0.8 ? colors.destructive : colors.accent,
          }]} />
        </View>
        <Text style={[styles.weightText, { color: colors.mutedForeground }]}>
          {currentWeight.toFixed(1)}/{game.maxWeight}kg
        </Text>
      </View>

      {/* Collect toast */}
      {showToast && (
        <Animated.View style={[styles.toast, { backgroundColor: colors.card, borderColor: colors.border }, toastStyle]} pointerEvents="none">
          {lastDrops ? (() => {
            const res = game.getResourceById(lastDrops.resourceId);
            return (
              <View style={styles.toastContent}>
                <View style={[styles.toastDot, { backgroundColor: res?.color ?? colors.primary }]} />
                <Text style={[styles.toastText, { color: colors.foreground }]}>
                  +{lastDrops.qty} {res?.name ?? lastDrops.resourceId} trouvé !
                </Text>
              </View>
            );
          })() : (
            <Text style={[styles.toastText, { color: colors.mutedForeground }]}>Rien trouvé cette fois…</Text>
          )}
        </Animated.View>
      )}

      <Modal visible={showCombat} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowCombat(false)}>
        <View style={styles.overlay}>
          <View style={[styles.combatBox, { backgroundColor: colors.card, borderColor: colors.destructive + '80' }]}>
            <View style={styles.combatHeader}>
              <View>
                <Text style={[styles.combatEyebrow, { color: colors.destructive }]}>DUEL DE DÉS</Text>
                <Text style={[styles.combatTitle, { color: colors.foreground }]}>{combatEnemy ? combatEnemy.name : region.boss.name}</Text>
              </View>
              <TouchableOpacity onPress={() => setShowCombat(false)} disabled={combatRound > 0 && !combatResult}>
                <Feather name="x" size={21} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.combatHint, { color: colors.mutedForeground }]}>
              Lancez trois fois. Votre score de Combat améliore légèrement vos jets.
            </Text>

            <View style={styles.scoreRow}>
              <View style={[styles.scoreCard, { backgroundColor: colors.secondary, borderColor: rc + '80' }]}>
                <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>VOUS</Text>
                <Text style={[styles.scoreValue, { color: rc }]}>{combatPlayerScore}</Text>
              </View>
              <Text style={[styles.vsText, { color: colors.mutedForeground }]}>VS</Text>
              <View style={[styles.scoreCard, { backgroundColor: colors.secondary, borderColor: colors.destructive + '80' }]}>
                <Text style={[styles.scoreLabel, { color: colors.mutedForeground }]}>ENNEMI</Text>
                <Text style={[styles.scoreValue, { color: colors.destructive }]}>{combatEnemyScore}</Text>
              </View>
            </View>

            <Text style={[styles.roundText, { color: colors.mutedForeground }]}>
              {combatResult ? 'Combat terminé' : `Manche ${Math.min(combatRound + 1, 3)} / 3`}
            </Text>
            {combatLastRoll && (
              <View style={[styles.lastRoll, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.lastRollText, { color: colors.foreground }]}>
                  Dernier lancer : <Text style={{ color: rc, fontWeight: '800' }}>vous {combatLastRoll.player}</Text>
                  {'  ·  '}
                  <Text style={{ color: colors.destructive, fontWeight: '800' }}>ennemi {combatLastRoll.enemy}</Text>
                </Text>
              </View>
            )}

            {combatResult ? (
              <>
                <Text style={[styles.combatOutcome, { color: combatResult.won ? '#4CAF50' : colors.destructive }]}>
                  {combatResult.won ? 'VICTOIRE !' : 'DÉFAITE'}
                </Text>
                <Text style={[styles.combatMessage, { color: colors.mutedForeground }]}>{combatResult.message}</Text>
                {combatResult.drops.length > 0 && (
                  <View style={styles.combatDrops}>
                    {combatResult.drops.map((drop) => (
                      <Text key={drop.resourceId} style={[styles.combatDropText, { color: colors.accent }]}>
                        +{drop.quantity} {game.getResourceById(drop.resourceId)?.name ?? drop.resourceId}
                      </Text>
                    ))}
                  </View>
                )}
                <TouchableOpacity style={[styles.combatAction, { backgroundColor: colors.primary }]} onPress={() => setShowCombat(false)}>
                  <Text style={[styles.combatActionText, { color: colors.primaryForeground }]}>Continuer</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={[styles.combatAction, { backgroundColor: colors.destructive }]} onPress={rollCombatDice}>
                <Feather name="rotate-cw" size={16} color="#fff" />
                <Text style={styles.combatActionText}>Lancer les dés</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── World Map Canvas ─────────────────────────────────────────────────────────
function WorldMapCanvas({
  mapWidth, mapHeight, gameHour, game, colors,
  onRegionPress, activeHideouts, onHideoutPress,
}: {
  mapWidth: number; mapHeight: number; gameHour: number;
  game: ReturnType<typeof useGame>;
  colors: ReturnType<typeof useColors>;
  onRegionPress: (region: RegionData) => void;
  activeHideouts: ActiveHideout[];
  onHideoutPress: (hideout: ActiveHideout) => void;
}) {
  const phase = getPhase(gameHour);
  const phaseConf = PHASE_CONFIG[phase];
  const nodeSize = Math.max(44, mapWidth * 0.115);

  // Precompute pixel positions
  const posPx = useMemo(() => {
    const result: Record<string, { x: number; y: number }> = {};
    for (const [id, pos] of Object.entries(REGION_POSITIONS)) {
      result[id] = { x: pos.x * mapWidth, y: pos.y * mapHeight };
    }
    return result;
  }, [mapWidth, mapHeight]);

  return (
    <View style={[styles.mapCanvas, { width: mapWidth, height: mapHeight, backgroundColor: '#1A0E08' }]}>
      {/* Background gradient */}
      <LinearGradient
        colors={['#1A0E08', '#0E0908', '#1A0E08']}
        style={StyleSheet.absoluteFillObject}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      {/* Subtle grid lines */}
      {[0.25, 0.5, 0.75].map((f) => (
        <View key={`h${f}`} style={[styles.gridLine, { top: mapHeight * f, left: 0, right: 0, height: 1 }]} />
      ))}
      {[0.33, 0.66].map((f) => (
        <View key={`v${f}`} style={[styles.gridLine, { left: mapWidth * f, top: 0, bottom: 0, width: 1 }]} />
      ))}

      {/* Road connections */}
      {CONNECTIONS.map(([a, b]) => {
        const pa = posPx[a];
        const pb = posPx[b];
        if (!pa || !pb) return null;
        const aLocked = !game.unlockedRegions.includes(a);
        const bLocked = !game.unlockedRegions.includes(b);
        const both = aLocked && bLocked;
        return (
          <MapLine
            key={`${a}-${b}`}
            x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
            color={both ? '#3A2510' : '#D4851A'}
          />
        );
      })}

      {/* Region nodes */}
      {game.allRegions.map((region) => {
        const pos = posPx[region.id];
        if (!pos) return null;
        const isUnlocked = game.unlockedRegions.includes(region.id);
        const canUnlock = game.player.level >= region.levelRequired;
        const exploration = game.regionExploration[region.id] ?? 0;
        return (
          <RegionNode
            key={region.id}
            region={region}
            isUnlocked={isUnlocked}
            canUnlock={canUnlock}
            exploration={exploration}
            x={pos.x}
            y={pos.y}
            nodeSize={nodeSize}
            onPress={() => onRegionPress(region)}
            colors={colors}
          />
        );
      })}

      {/* Hideout chest badges */}
      {activeHideouts.filter((h) => game.unlockedRegions.includes(h.regionId)).map((hideout) => {
        const pos = posPx[hideout.regionId];
        if (!pos) return null;
        return (
          <Pressable
            key={hideout.slotId}
            style={[styles.hideoutBadgeBtn, { left: pos.x + nodeSize * 0.28, top: pos.y - nodeSize * 0.6 }]}
            onPress={() => onHideoutPress(hideout)}
            hitSlop={10}
          >
            <Text style={{ fontSize: 16 }}>📦</Text>
          </Pressable>
        );
      })}

      {/* Day/night tint overlay */}
      {phase !== 'day' && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: phaseConf.tint, pointerEvents: 'none' }]} />
      )}

      {/* Phase indicator */}
      <View style={[styles.phaseLabel, { backgroundColor: 'rgba(12,9,6,0.85)', borderColor: 'rgba(200,140,60,0.3)', borderWidth: 1 }]}>
        <MaterialCommunityIcons name={phaseConf.icon} size={18} color="#D4851A" style={{ marginRight: 6 }} />
        <Text style={[styles.phaseLabelText, { color: '#D4851A' }]}>
          {phaseConf.label} · {String(gameHour).padStart(2, '0')}h00
        </Text>
      </View>

      {/* Map border frame */}
      <View style={[styles.mapBorder, { borderColor: '#D4851A40', pointerEvents: 'none' }]} />
    </View>
  );
}

// ─── Market ───────────────────────────────────────────────────────────────────
const mStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.86)', justifyContent: 'flex-end' },
  sheet: { height: '83%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, padding: 20 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  subtitle: { fontSize: 12, lineHeight: 17, marginBottom: 14 },
  goldRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, alignSelf: 'flex-start', marginBottom: 12 },
  goldText: { fontSize: 13, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 6, marginBottom: 14 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  tabText: { fontSize: 11, fontWeight: '700' },
  sellMsg: { fontSize: 14, fontWeight: '700' },
  emptyRow: { borderRadius: 10, borderWidth: 1, padding: 14 },
  emptyText: { fontSize: 12, textAlign: 'center' },
  marketRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 10, marginBottom: 8, gap: 10 },
  resDot: { width: 12, height: 12, borderRadius: 6 },
  resInfo: { flex: 1 },
  resName: { fontSize: 13, fontWeight: '600' },
  resStock: { fontSize: 11, marginTop: 1 },
  enigmaLabel: { fontSize: 10, fontWeight: '700', color: '#C084FC', marginTop: 2 },
  sellControls: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  qtyBtn: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  qtyText: { fontSize: 13, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  sellBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  sellBtnText: { fontSize: 11, fontWeight: '700' },
  confirmOverlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.7)' },
  confirmCard: { borderRadius: 18, padding: 20, borderWidth: 1 },
  confirmTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
  confirmText: { fontSize: 14, lineHeight: 20, textAlign: 'center', marginBottom: 18 },
  confirmReward: { fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 18 },
  confirmActions: { flexDirection: 'row', gap: 10 },
  confirmBtn: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10 },
  confirmBtnText: { fontSize: 14, fontWeight: '800' },
});

type PendingSale =
  | { kind: 'resource'; resourceId: string; name: string; qty: number; gold: number }
  | { kind: 'item'; instanceId: string; name: string; gold: number };

type MarketTab = 'sell_res' | 'sell_items' | 'buy';

function MarketModal({ visible, onClose, game, colors, bottomPad }: {
  visible: boolean;
  onClose: () => void;
  game: ReturnType<typeof useGame>;
  colors: ReturnType<typeof useColors>;
  bottomPad: number;
}) {
  const [sellQtys, setSellQtys] = useState<Record<string, number>>({});
  const [buyQtys, setBuyQtys] = useState<Record<string, number>>({});
  const [lastSellMsg, setLastSellMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<MarketTab>('sell_res');
  const [pendingSale, setPendingSale] = useState<PendingSale | null>(null);

  const inventoryResources = game.inventory.filter((i) => i.quantity > 0);
  const sellableItems = game.craftedItems;

  // Minimum forge level required to purchase a resource
  const requiredForgeLevel = (resourceLevel: number) => Math.max(1, Math.ceil((resourceLevel - 3) / 3));
  // Whether the player's current forge level unlocks a resource for purchase
  const isBuyUnlocked = (resourceLevel: number) => resourceLevel <= game.player.forgeLevel * 3 + 3;

  // All resources sorted by level; level-15+ rare ones show even when locked (so players see what to aim for)
  const RARE_BUY_THRESHOLD = 15;
  const buyableResources = game.allResources.slice().sort((a, b) => a.level - b.level);

  const getSellQty = (id: string) => sellQtys[id] ?? 1;
  const setSellQty = (id: string, qty: number) => setSellQtys((prev) => ({ ...prev, [id]: qty }));
  const getBuyQty = (id: string) => buyQtys[id] ?? 1;
  const setBuyQty = (id: string, qty: number) => setBuyQtys((prev) => ({ ...prev, [id]: qty }));

  // Price multiplier scales with rarity for level-15+ resources
  const rarePriceMultiplier = (resourceLevel: number): number => {
    if (resourceLevel >= 26) return 5;
    if (resourceLevel >= 21) return 4;
    if (resourceLevel >= RARE_BUY_THRESHOLD) return 3;
    return 1.35;
  };

  const getBuyPrice = (resourceId: string) => {
    const res = game.getResourceById(resourceId);
    if (!res) return 0;
    return Math.round(res.baseValue * rarePriceMultiplier(res.level));
  };

  const confirmSale = () => {
    if (!pendingSale) return;
    const earned = pendingSale.kind === 'resource'
      ? game.sellResource(pendingSale.resourceId, pendingSale.qty)
      : game.sellItem(pendingSale.instanceId);
    if (earned > 0) {
      setLastSellMsg(`+${earned} or reçus`);
      setTimeout(() => setLastSellMsg(null), 1800);
      AudioManager.playCoin();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setPendingSale(null);
  };

  const handleBuy = (resourceId: string) => {
    const qty = getBuyQty(resourceId);
    const res = game.getResourceById(resourceId);
    const unitPrice = getBuyPrice(resourceId);
    const total = unitPrice * qty;
    if (game.player.gold < total) {
      setLastSellMsg(`Or insuffisant (${total}g requis)`);
      setTimeout(() => setLastSellMsg(null), 2000);
      return;
    }
    const ok = game.buyResource(resourceId, qty);
    if (ok) {
      setLastSellMsg(`${qty}× ${res?.name ?? resourceId} acheté${qty > 1 ? 's' : ''} (-${total}g)`);
      setTimeout(() => setLastSellMsg(null), 2000);
      AudioManager.playCoin();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const TABS: { key: MarketTab; label: string }[] = [
    { key: 'sell_res', label: 'Vendre res.' },
    { key: 'sell_items', label: 'Vendre objets' },
    { key: 'buy', label: 'Acheter' },
  ];

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={mStyles.overlay}>
        <View style={[mStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[mStyles.handle, { backgroundColor: colors.muted }]} />
          <View style={mStyles.header}>
            <Feather name="shopping-bag" size={19} color={colors.accent} />
            <Text style={[mStyles.title, { color: colors.foreground }]}>PLACE DU MARCHÉ</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Fermer le marché">
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <View style={[mStyles.goldRow, { backgroundColor: colors.secondary }]}>
            <Feather name="dollar-sign" size={13} color={colors.accent} />
            <Text style={[mStyles.goldText, { color: colors.accent }]}>{game.player.gold}g disponible</Text>
          </View>
          <View style={mStyles.tabs}>
            {TABS.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[mStyles.tab, { backgroundColor: tab === t.key ? colors.primary : colors.secondary, borderColor: tab === t.key ? colors.primary : colors.border }]}
                onPress={() => setTab(t.key)}
              >
                <Text style={[mStyles.tabText, { color: tab === t.key ? colors.primaryForeground : colors.mutedForeground }]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {lastSellMsg && (
            <Text style={[mStyles.sellMsg, { color: lastSellMsg.startsWith('+') || lastSellMsg.includes('acheté') ? '#4CAF50' : '#F44336', textAlign: 'center', marginBottom: 8 }]}>
              {lastSellMsg}
            </Text>
          )}

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad + 20 }}>
            {tab === 'sell_res' && (
              <>
                <Text style={[mStyles.subtitle, { color: colors.mutedForeground }]}>Vous recevez 80% du cours affiché.</Text>
                {inventoryResources.length === 0 ? (
                  <View style={[mStyles.emptyRow, { borderColor: colors.border }]}>
                    <Text style={[mStyles.emptyText, { color: colors.mutedForeground }]}>
                      Votre inventaire est vide. Collectez des ressources pour vendre.
                    </Text>
                  </View>
                ) : (
                  inventoryResources.map((inv) => {
                    const res = game.getResourceById(inv.resourceId);
                    if (!res) return null;
                    const marketMult = game.marketPrices[inv.resourceId] ?? 1.0;
                    const sellPrice = Math.round(res.baseValue * marketMult * 0.8);
                    const trend = marketMult > 1.05 ? '↑' : marketMult < 0.95 ? '↓' : '→';
                    const trendColor = marketMult > 1.05 ? '#4CAF50' : marketMult < 0.95 ? '#F44336' : colors.mutedForeground;
                    const qty = getSellQty(inv.resourceId);
                    return (
                      <View key={inv.resourceId} style={[mStyles.marketRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                        <View style={[mStyles.resDot, { backgroundColor: res.color }]} />
                        <View style={mStyles.resInfo}>
                          <Text style={[mStyles.resName, { color: colors.foreground }]}>{res.name}</Text>
                          <Text style={[mStyles.resStock, { color: colors.mutedForeground }]}>
                            Stock: {inv.quantity} · {sellPrice}g/u <Text style={{ color: trendColor }}>{trend}</Text>
                          </Text>
                        </View>
                        <View style={mStyles.sellControls}>
                          <TouchableOpacity style={[mStyles.qtyBtn, { backgroundColor: colors.secondary }]} onPress={() => setSellQty(inv.resourceId, Math.max(1, qty - 1))}>
                            <Feather name="minus" size={11} color={colors.foreground} />
                          </TouchableOpacity>
                          <Text style={[mStyles.qtyText, { color: colors.foreground }]}>{qty}</Text>
                          <TouchableOpacity style={[mStyles.qtyBtn, { backgroundColor: colors.secondary }]} onPress={() => setSellQty(inv.resourceId, Math.min(inv.quantity, qty + 1))}>
                            <Feather name="plus" size={11} color={colors.foreground} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[mStyles.sellBtn, { backgroundColor: colors.primary }]}
                            onPress={() => setPendingSale({ kind: 'resource', resourceId: inv.resourceId, name: res.name, qty, gold: sellPrice * qty })}
                          >
                            <Text style={[mStyles.sellBtnText, { color: colors.primaryForeground }]}>
                              Vendre · {sellPrice * qty}g
                            </Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })
                )}
              </>
            )}

            {tab === 'sell_items' && (
              <>
                <Text style={[mStyles.subtitle, { color: colors.mutedForeground }]}>Vous recevez 85% de la valeur d'estimation.</Text>
                {sellableItems.length === 0 ? (
                  <View style={[mStyles.emptyRow, { borderColor: colors.border }]}>
                    <Text style={[mStyles.emptyText, { color: colors.mutedForeground }]}>
                      Aucun objet forgé. Forgez d'abord des objets.
                    </Text>
                  </View>
                ) : (
                  sellableItems.map((item) => {
                    const sellPct = item.enigmaMastered ? 0.92 : 0.85;
                    const sellPrice = Math.round(item.value * sellPct);
                    return (
                      <View key={item.instanceId} style={[mStyles.marketRow, { backgroundColor: colors.card, borderColor: item.enigmaMastered ? '#C084FC55' : colors.border, borderWidth: item.enigmaMastered ? 1.5 : 1 }]}>
                        <MaterialCommunityIcons name="hammer" size={20} color={item.enigmaMastered ? '#C084FC' : colors.mutedForeground} />
                        <View style={mStyles.resInfo}>
                          <Text style={[mStyles.resName, { color: colors.foreground }]}>{item.name}</Text>
                          <Text style={[mStyles.resStock, { color: colors.mutedForeground }]}>{item.category} · {item.quality} · {item.value}g</Text>
                          {item.enigmaMastered && (
                            <Text style={mStyles.enigmaLabel}>✦ Forgé avec Maîtrise · +{Math.round((sellPct - 0.85) * 100)}% sur la vente</Text>
                          )}
                        </View>
                        <TouchableOpacity
                          style={[mStyles.sellBtn, { backgroundColor: item.enigmaMastered ? '#7C3AED' : colors.primary }]}
                          onPress={() => setPendingSale({ kind: 'item', instanceId: item.instanceId, name: item.name, gold: sellPrice })}
                        >
                          <Text style={[mStyles.sellBtnText, { color: colors.primaryForeground }]}>Vendre · {sellPrice}g</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </>
            )}

            {tab === 'buy' && (
              <>
                <Text style={[mStyles.subtitle, { color: colors.mutedForeground }]}>
                  Achetez des matériaux directement. Les ressources rares (Niv.15+) sont disponibles à prix élevé selon votre niveau de forge.
                </Text>
                {buyableResources.map((res) => {
                  const unlocked = isBuyUnlocked(res.level);
                  const isRare = res.level >= RARE_BUY_THRESHOLD;
                  // Hide common resources that haven't been unlocked yet (only rare ones stay visible as locked)
                  if (!unlocked && !isRare) return null;
                  const unitPrice = getBuyPrice(res.id);
                  const qty = getBuyQty(res.id);
                  const total = unitPrice * qty;
                  const canAfford = game.player.gold >= total;
                  const reqForge = requiredForgeLevel(res.level);
                  const mult = rarePriceMultiplier(res.level);

                  if (!unlocked) {
                    // Locked rare resource — visible but grayed out
                    return (
                      <View
                        key={res.id}
                        style={[mStyles.marketRow, { backgroundColor: colors.secondary, borderColor: colors.muted, opacity: 0.65 }]}
                      >
                        <View style={[mStyles.resDot, { backgroundColor: res.color, opacity: 0.5 }]} />
                        <View style={mStyles.resInfo}>
                          <Text style={[mStyles.resName, { color: colors.mutedForeground }]}>{res.name}</Text>
                          <Text style={[mStyles.resStock, { color: colors.mutedForeground }]}>
                            ~{unitPrice}g/u · Niv.{res.level}
                          </Text>
                        </View>
                        <View style={[mStyles.sellBtn, { backgroundColor: colors.muted, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                          <Feather name="lock" size={11} color={colors.mutedForeground} />
                          <Text style={[mStyles.sellBtnText, { color: colors.mutedForeground }]}>
                            Forge niv.{reqForge}
                          </Text>
                        </View>
                      </View>
                    );
                  }

                  return (
                    <View key={res.id} style={[mStyles.marketRow, {
                      backgroundColor: colors.card,
                      borderColor: isRare ? res.color + '60' : colors.border,
                      borderWidth: isRare ? 1.5 : 1,
                    }]}>
                      <View style={[mStyles.resDot, { backgroundColor: res.color }]} />
                      <View style={mStyles.resInfo}>
                        <Text style={[mStyles.resName, { color: isRare ? res.color : colors.foreground }]}>{res.name}</Text>
                        <Text style={[mStyles.resStock, { color: colors.mutedForeground }]}>
                          {unitPrice}g/u · Niv.{res.level}
                          {isRare ? <Text style={{ color: '#F9A825' }}>  ×{mult} (rare)</Text> : null}
                        </Text>
                      </View>
                      <View style={mStyles.sellControls}>
                        <TouchableOpacity style={[mStyles.qtyBtn, { backgroundColor: colors.secondary }]} onPress={() => setBuyQty(res.id, Math.max(1, qty - 1))}>
                          <Feather name="minus" size={11} color={colors.foreground} />
                        </TouchableOpacity>
                        <Text style={[mStyles.qtyText, { color: colors.foreground }]}>{qty}</Text>
                        <TouchableOpacity style={[mStyles.qtyBtn, { backgroundColor: colors.secondary }]} onPress={() => setBuyQty(res.id, qty + 1)}>
                          <Feather name="plus" size={11} color={colors.foreground} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[mStyles.sellBtn, { backgroundColor: canAfford ? (isRare ? '#9C27B0' : '#2196F3') : colors.muted }]}
                          onPress={() => canAfford && handleBuy(res.id)}
                          activeOpacity={canAfford ? 0.8 : 1}
                        >
                          <Text style={[mStyles.sellBtnText, { color: canAfford ? '#fff' : colors.mutedForeground }]}>
                            Acheter · {total}g
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>
      </View>

      {pendingSale && (
        <View style={[StyleSheet.absoluteFillObject, mStyles.confirmOverlay]}>
          <View style={[mStyles.confirmCard, { backgroundColor: colors.card, borderColor: colors.accent }]}>
            <Text style={[mStyles.confirmTitle, { color: colors.foreground }]}>Confirmer la vente</Text>
            <Text style={[mStyles.confirmText, { color: colors.mutedForeground }]}>
              {pendingSale?.kind === 'resource'
                ? `Vendre ${pendingSale.qty} × ${pendingSale.name} ?`
                : `Vendre ${pendingSale?.name ?? ''} ?`}
            </Text>
            <Text style={[mStyles.confirmReward, { color: colors.accent }]}>+{pendingSale?.gold ?? 0} or</Text>
            <View style={mStyles.confirmActions}>
              <TouchableOpacity style={[mStyles.confirmBtn, { backgroundColor: colors.secondary }]} onPress={() => setPendingSale(null)}>
                <Text style={[mStyles.confirmBtnText, { color: colors.mutedForeground }]}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[mStyles.confirmBtn, { backgroundColor: colors.primary }]} onPress={confirmSale}>
                <Text style={[mStyles.confirmBtnText, { color: colors.primaryForeground }]}>Vendre</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </Modal>
  );
}

const mmStyles = StyleSheet.create({
  wrap: { paddingVertical: 6 },
  row: { paddingHorizontal: 12, paddingBottom: 4, gap: 8 },
  tile: { width: 68, alignItems: 'center', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 4, gap: 3, position: 'relative' },
  chestBadge: { position: 'absolute', top: -5, right: -5, zIndex: 2 },
  tileLabel: { fontSize: 9, fontWeight: '700', textAlign: 'center' },
  reqLabel: { fontSize: 8, fontWeight: '600', textAlign: 'center' },
});
export default function WorldScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const game = useGame();
  const { width: screenWidth } = useWindowDimensions();

  const [selectedRegion, setSelectedRegion] = useState<RegionData | null>(null);
  const [exploringRegion, setExploringRegion] = useState<RegionData | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [fouilleTarget, setFouilleTarget] = useState<ActiveHideout | null>(null);
  const [gameHour, setGameHour] = useState(() => new Date().getHours());
  const [collectResult, setCollectResult] = useState<{ drops: { resourceId: string; quantity: number }[]; regionCompleted: boolean; completionRewards?: { gold: number; playerXp: number; harvestXp: number; talentPoint: number } }>({ drops: [], regionCompleted: false });
  const [showCollectResult, setShowCollectResult] = useState(false);
  const [showMarket, setShowMarket] = useState(false);
  const [workerReturnEntries, setWorkerReturnEntries] = useState<WorkerReturnEntry[]>([]);

  // ── Quick-collect cooldown state ──────────────────────────────────────────
  const [qcStep, setQcStep]       = useState(0);   // next step index (0-4)
  const [qcLastAt, setQcLastAt]   = useState(0);   // ms timestamp of last use
  const [qcCoolSec, setQcCoolSec] = useState(0);   // duration of active cooldown (s)
  const [qcRemaining, setQcRemaining] = useState(0); // live countdown (s)

  // Load persisted state on mount
  useEffect(() => {
    AsyncStorage.multiGet([QC_KEY_STEP, QC_KEY_LAST, QC_KEY_COOL]).then((pairs) => {
      const step  = pairs[0][1] != null ? parseInt(pairs[0][1], 10) : 0;
      const last  = pairs[1][1] != null ? parseInt(pairs[1][1], 10) : 0;
      const cool  = pairs[2][1] != null ? parseInt(pairs[2][1], 10) : 0;
      const elapsedS = last > 0 ? (Date.now() - last) / 1000 : Infinity;
      // Step resets if the player was idle for more than QC_RESET_S
      const effectiveStep = elapsedS > QC_RESET_S ? 0 : step;
      setQcStep(effectiveStep);
      setQcLastAt(last);
      setQcCoolSec(cool);
      if (effectiveStep !== step) {
        AsyncStorage.setItem(QC_KEY_STEP, '0').catch(() => {});
      }
    }).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 1-second ticker: recomputes remaining whenever lastAt or coolSec changes
  useEffect(() => {
    if (qcLastAt === 0 || qcCoolSec === 0) { setQcRemaining(0); return; }
    const compute = () => Math.max(0, Math.ceil(qcCoolSec - (Date.now() - qcLastAt) / 1000));
    setQcRemaining(compute());
    const id = setInterval(() => {
      const r = compute();
      setQcRemaining(r);
      if (r <= 0) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [qcLastAt, qcCoolSec]);

  const qcIsReady = qcRemaining <= 0;

  const headerTopPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 96;

  const mapWidth = screenWidth - 32;
  const mapHeight = Math.round(mapWidth * 0.82);

  // Day/Night: 1 real minute = 1 game hour (60-second tick)
  useEffect(() => {
    const tick = () => setGameHour((h) => (h + 1) % 24);
    const t = setInterval(tick, 60000);
    return () => clearInterval(t);
  }, []);

  // Show return recap when the screen loads and workers have been busy
  useEffect(() => {
    if (!game.isLoaded || game.workers.length === 0) return;
    const now = Date.now();
    const entries: WorkerReturnEntry[] = game.workers
      .filter((w) => now - w.lastClaimedAt >= MIN_RECAP_MS)
      .map((w) => ({
        worker: w,
        result: computeWorkerHarvest(w.level, w.xp, w.type, w.lastClaimedAt, now),
      }))
      .filter((e) => e.result.resources.length > 0 || e.result.bonusResource != null);
    if (entries.length > 0) setWorkerReturnEntries(entries);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.isLoaded]);

  const handleRegionPress = useCallback((region: RegionData) => {
    const isUnlocked = game.unlockedRegions.includes(region.id);
    if (isUnlocked) {
      setSelectedRegion(region);
      setShowDetail(true);
    } else if (game.player.level >= region.levelRequired) {
      // Auto-unlock with animation
      game.unlockRegion(region.id);
      AudioManager.playRegionUnlock();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelectedRegion(region);
      setShowDetail(true);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [game]);

  const handleQuickCollect = useCallback(() => {
    if (!selectedRegion || qcRemaining > 0) return;
    AudioManager.playCollect();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = game.collectFromRegion(selectedRegion.id);
    setShowDetail(false);
    setSelectedRegion(null);
    setCollectResult(result);
    setShowCollectResult(true);
    if (result.regionCompleted) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    // Apply the current cooldown step, then advance for next use
    const thisStep  = Math.min(qcStep, QC_STEPS.length - 1);
    const coolSec   = QC_STEPS[thisStep];
    const nextStep  = Math.min(qcStep + 1, QC_STEPS.length - 1);
    const now       = Date.now();

    setQcStep(nextStep);
    setQcLastAt(now);
    setQcCoolSec(coolSec);

    AsyncStorage.multiSet([
      [QC_KEY_STEP, String(nextStep)],
      [QC_KEY_LAST, String(now)],
      [QC_KEY_COOL, String(coolSec)],
    ]).catch(() => {});
  }, [selectedRegion, game, qcStep, qcRemaining]);

  const handleExplore = useCallback(() => {
    if (!selectedRegion) return;
    setShowDetail(false);
    setExploringRegion(selectedRegion);
    setSelectedRegion(null);
  }, [selectedRegion]);

  const collectWindowMs = 3000 + game.getTalentBonus('hideoutWindowBonus');

  // Only show hideouts that haven't expired yet (purge loop fires every 60 s,
  // so stale entries can linger briefly — filter them out at render time).
  const validHideouts = useMemo(
    () => (game.activeHideouts ?? []).filter((h) => h.expiresAt > Date.now()),
    [game.activeHideouts],
  );

  const handleHideoutPress = useCallback((h: ActiveHideout) => {
    setFouilleTarget(h);
  }, []);

  if (!game.isLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // If in exploration view, show that instead of the map
  if (exploringRegion) {
    return (
      <ExploreView
        region={exploringRegion}
        onBack={() => setExploringRegion(null)}
        colors={colors}
        insets={insets}
      />
    );
  }

  const phase = getPhase(gameHour);
  const phaseConf = PHASE_CONFIG[phase];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <LinearGradient
        colors={[colors.card as string, 'transparent']}
        style={[styles.header, { paddingTop: headerTopPad + 10 }]}
      >
        <View style={styles.headerLeft}>
          <Feather name="map" size={20} color={colors.primary} />
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>MONDE</Text>
            {game.player.forgeName ? (
              <Text style={[styles.headerForgeName, { color: colors.mutedForeground }]} numberOfLines={1}>
                {game.player.forgeName}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.marketShortcut, { backgroundColor: colors.accent }]}
            onPress={() => setShowMarket(true)}
            accessibilityLabel="Ouvrir la place du marché"
          >
            <Feather name="shopping-bag" size={13} color="#000" />
            <Text style={styles.marketShortcutText}>Marché</Text>
          </TouchableOpacity>
          <View style={[styles.headerBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.headerBadgeText, { color: colors.mutedForeground }]}>
              <MaterialCommunityIcons name={phaseConf.icon} size={14} color="#D4851A" /> {phaseConf.label}
            </Text>
          </View>
          <View style={[styles.headerBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.headerBadgeText, { color: colors.accent }]}>
              {game.unlockedRegions.length}/10 régions
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── Minimap strip ── */}
      <RegionMinimap
        regions={game.allRegions}
        unlockedRegions={game.unlockedRegions}
        activeHideouts={validHideouts}
        playerLevel={game.player.level}
        onRegionPress={handleRegionPress}
        colors={colors}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad }}
      >
        {/* ── Map ── */}
        <View style={[styles.mapWrapper, { paddingHorizontal: 16, paddingTop: 8 }]}>
          <WorldMapCanvas
            mapWidth={mapWidth}
            mapHeight={mapHeight}
            gameHour={gameHour}
            game={game}
            colors={colors}
            onRegionPress={handleRegionPress}
            activeHideouts={validHideouts}
            onHideoutPress={handleHideoutPress}
          />
        </View>

        {/* ── Region list below map ── */}
        <View style={[styles.listSection, { paddingHorizontal: 16, marginTop: 14 }]}>
          <Text style={[styles.listSectionTitle, { color: colors.primary }]}>
            RÉGIONS
          </Text>
          {game.allRegions.map((region) => {
            const isUnlocked = game.unlockedRegions.includes(region.id);
            const canUnlock = !isUnlocked && game.player.level >= region.levelRequired;
            const exploration = game.regionExploration[region.id] ?? 0;
            const rc = REGION_COLORS[region.id] ?? colors.primary;
            return (
              <TouchableOpacity
                key={region.id}
                style={[
                  styles.regionRow,
                  {
                    backgroundColor: colors.card,
                    borderColor: isUnlocked ? rc : canUnlock ? colors.accent : colors.border,
                    opacity: !isUnlocked && !canUnlock ? 0.55 : 1,
                  },
                ]}
                onPress={() => handleRegionPress(region)}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name={isUnlocked ? (REGION_ICONS[region.id] ?? 'map-marker') : 'lock'}
                  size={20}
                  color={isUnlocked ? '#F2E4C4' : colors.mutedForeground}
                  style={{ marginRight: 2 }}
                />
                <View style={styles.regionRowInfo}>
                  <View style={styles.regionRowTop}>
                    <Text style={[styles.regionRowName, { color: isUnlocked ? colors.foreground : colors.mutedForeground }]}>
                      {region.name}
                    </Text>
                    {isUnlocked && game.completedRegions.includes(region.id) && (
                      <View style={[styles.unlockedBadge, { backgroundColor: '#FFD70028' }]}>
                        <MaterialCommunityIcons name="trophy" size={10} color="#FFD700" style={{ marginRight: 2 }} /><Text style={[styles.unlockedText, { color: '#FFD700' }]}>COMPLÉTÉ</Text>
                      </View>
                    )}
                    {isUnlocked && !game.completedRegions.includes(region.id) && (
                      <View style={[styles.unlockedBadge, { backgroundColor: rc + '28' }]}>
                        <Text style={[styles.unlockedText, { color: rc }]}>DÉBLOQUÉ</Text>
                      </View>
                    )}
                    {canUnlock && (
                      <View style={[styles.unlockedBadge, { backgroundColor: colors.accent + '28' }]}>
                        <Text style={[styles.unlockedText, { color: colors.accent }]}>DISPONIBLE</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.regionRowBiome, { color: colors.mutedForeground }]}>
                    {region.biome} · Niv.{region.levelRequired}
                  </Text>
                  {isUnlocked && (
                    <View style={styles.regionRowProgress}>
                      <View style={[styles.miniTrack, { backgroundColor: colors.muted }]}>
                        <View style={[styles.miniFill, { width: `${exploration}%` as `${number}%`, backgroundColor: rc }]} />
                      </View>
                      <Text style={[styles.miniPct, { color: colors.mutedForeground }]}>{exploration}%</Text>
                    </View>
                  )}
                  {!isUnlocked && !canUnlock && (
                    <Text style={[styles.levelReq, { color: colors.destructive }]}>
                      Niveau {region.levelRequired} requis
                    </Text>
                  )}
                </View>
                <Feather
                  name={isUnlocked ? 'chevron-right' : canUnlock ? 'unlock' : 'lock'}
                  size={17}
                  color={isUnlocked ? colors.mutedForeground : canUnlock ? colors.accent : colors.destructive}
                />
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Guilde des Travailleurs ── */}
        <GuildeSection />

      </ScrollView>

      {/* Worker return recap modal */}
      <WorkerReturnModal
        visible={workerReturnEntries.length > 0}
        entries={workerReturnEntries}
        getResourceName={(id) => game.getResourceById(id)?.name ?? id}
        getResourceColor={(id) => game.getResourceById(id)?.color ?? '#888'}
        onCollect={() => {
          // Pass the exact precomputed result so granted rewards match what was displayed.
          workerReturnEntries.forEach((e) => game.collectWorker(e.worker.id, e.result));
          setWorkerReturnEntries([]);
        }}
      />

      <FouilleModal
        visible={fouilleTarget !== null}
        hideout={fouilleTarget}
        region={fouilleTarget ? (game.allRegions.find((r) => r.id === fouilleTarget.regionId) ?? null) : null}
        collectWindowMs={collectWindowMs}
        onCollect={() => fouilleTarget ? game.collectHideout(fouilleTarget.slotId, fouilleTarget.regionId) : { success: false, rewards: [] }}
        onClose={() => setFouilleTarget(null)}
      />

      <MarketModal visible={showMarket} onClose={() => setShowMarket(false)} game={game} colors={colors} bottomPad={bottomPad} />

      {/* ── Region detail sheet ── */}
      <Modal visible={showDetail && !!selectedRegion} transparent animationType="slide" statusBarTranslucent>
        {selectedRegion && (
          <View style={styles.overlay}>
            <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: REGION_COLORS[selectedRegion.id] ?? colors.border }]}>
              <View style={[styles.handle, { backgroundColor: colors.muted }]} />

              {/* Region header */}
              <View style={styles.sheetHeader}>
                <MaterialCommunityIcons name={REGION_ICONS[selectedRegion.id] ?? 'map-marker'} size={36} color="#F2E4C4" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetTitle, { color: colors.foreground }]}>{selectedRegion.name}</Text>
                  <Text style={[styles.sheetBiome, { color: colors.mutedForeground }]}>
                    {selectedRegion.biome} · Niv.{selectedRegion.levelRequired}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowDetail(false)}>
                  <Feather name="x" size={22} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>

              {/* Exploration bar */}
              <View style={styles.detailExpRow}>
                <Text style={[styles.detailExpLabel, { color: colors.mutedForeground }]}>Exploration</Text>
                <View style={[styles.detailExpTrack, { backgroundColor: colors.muted }]}>
                  <View style={[styles.detailExpFill, {
                    width: `${game.regionExploration[selectedRegion.id] ?? 0}%` as `${number}%`,
                    backgroundColor: REGION_COLORS[selectedRegion.id] ?? colors.primary,
                  }]} />
                </View>
                <Text style={[styles.detailExpPct, { color: REGION_COLORS[selectedRegion.id] ?? colors.primary }]}>
                  {game.regionExploration[selectedRegion.id] ?? 0}%
                </Text>
              </View>

              <Text style={[styles.sheetDesc, { color: colors.mutedForeground }]}>{selectedRegion.description}</Text>

              {/* Resources */}
              <Text style={[styles.sheetLabel, { color: colors.primary }]}>RESSOURCES</Text>
              <View style={styles.resourceGrid}>
                {selectedRegion.resourceNodes.map((node) => {
                  const res = game.getResourceById(node.resourceId);
                  return (
                    <View key={node.resourceId} style={[styles.resourceChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                      <View style={[styles.resDot, { backgroundColor: res?.color ?? colors.primary }]} />
                      <Text style={[styles.resName, { color: colors.foreground }]}>{res?.name ?? node.resourceId}</Text>
                      <Text style={[styles.resRate, { color: colors.mutedForeground }]}>{Math.round(node.dropRate * 100)}%</Text>
                    </View>
                  );
                })}
              </View>

              {/* Secondary enemies */}
              {selectedRegion.enemies && selectedRegion.enemies.length > 0 && (
                <>
                  <Text style={[styles.sheetLabel, { color: colors.primary }]}>GARDES</Text>
                  {selectedRegion.enemies.map((enemy) => (
                    <View key={enemy.id} style={[styles.bossCard, { backgroundColor: colors.secondary, borderColor: '#FF6F0040', marginBottom: 6 }]}>
                      <MaterialCommunityIcons name="shield-sword" size={20} color="#FF6F00" />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.bossName, { color: colors.foreground }]}>{enemy.name}</Text>
                        <Text style={[styles.bossDesc, { color: colors.mutedForeground }]}>{enemy.description}</Text>
                      </View>
                      <Text style={[styles.bossLevel, { color: '#FF6F00' }]}>Niv.{enemy.level}</Text>
                    </View>
                  ))}
                </>
              )}

              {/* Boss */}
              <Text style={[styles.sheetLabel, { color: colors.primary }]}>BOSS</Text>
              <View style={[styles.bossCard, { backgroundColor: colors.secondary, borderColor: colors.destructive + '40' }]}>
                <MaterialCommunityIcons name="skull-crossbones" size={22} color={colors.destructive} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bossName, { color: colors.foreground }]}>{selectedRegion.boss.name}</Text>
                  <Text style={[styles.bossDesc, { color: colors.mutedForeground }]}>{selectedRegion.boss.description}</Text>
                </View>
                <Text style={[styles.bossLevel, { color: colors.destructive }]}>Niv.{selectedRegion.boss.level}</Text>
              </View>

              {/* Buttons */}
              <View style={styles.sheetBtns}>
                <TouchableOpacity
                  style={[
                    styles.btnSecondary,
                    { backgroundColor: colors.secondary, borderColor: colors.border },
                    !qcIsReady && { opacity: 0.55, borderColor: colors.mutedForeground },
                  ]}
                  onPress={handleQuickCollect}
                  disabled={!qcIsReady}
                  activeOpacity={0.8}
                >
                  <Feather
                    name={qcIsReady ? 'package' : 'clock'}
                    size={15}
                    color={qcIsReady ? colors.accent : colors.mutedForeground}
                  />
                  {qcIsReady ? (
                    <Text style={[styles.btnSecondaryText, { color: colors.accent }]}>
                      Collecte rapide
                    </Text>
                  ) : (
                    <View style={{ alignItems: 'center' }}>
                      <Text style={[styles.btnSecondaryText, { color: colors.mutedForeground, fontSize: 10 }]}>
                        Collecte rapide
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.mutedForeground }}>
                        {qcRemaining}s
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnExplore, { backgroundColor: REGION_COLORS[selectedRegion.id] ?? colors.primary }]}
                  onPress={handleExplore}
                >
                  <Feather name="compass" size={15} color="#fff" />
                  <Text style={styles.btnExploreText}>Explorer</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Modal>

      {/* ── Quick collect result ── */}
      <Modal visible={showCollectResult} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.overlay}>
          <View style={[
            styles.resultBox,
            {
              backgroundColor: colors.card,
              borderColor: collectResult.regionCompleted ? '#FFD700' : colors.border,
              borderWidth: collectResult.regionCompleted ? 2 : 1,
            },
          ]}>
            {/* Region completion banner */}
            {collectResult.regionCompleted && collectResult.completionRewards && (
              <View style={[styles.completionBanner, { backgroundColor: '#FFD70022', borderColor: '#FFD70066' }]}>
                <MaterialCommunityIcons name="trophy" size={28} color="#FFD700" style={{ alignSelf: 'center' }} />
                <Text style={[styles.completionTitle, { color: '#FFD700' }]}>Région explorée à 100 % !</Text>
                <View style={styles.completionRewards}>
                  <Text style={[styles.completionRewardText, { color: colors.foreground }]}>
                    +{collectResult.completionRewards.gold}g
                  </Text>
                  <Text style={[styles.completionRewardText, { color: colors.accent }]}>
                    +{collectResult.completionRewards.playerXp} XP
                  </Text>
                  {collectResult.completionRewards.talentPoint > 0 && (
                    <Text style={[styles.completionRewardText, { color: '#CE93D8' }]}>
                      +1 talent
                    </Text>
                  )}
                </View>
              </View>
            )}

            <MaterialCommunityIcons name="bag-personal" size={32} color={colors.accent} style={{ alignSelf: 'center' }} />
            <Text style={[styles.resultTitle, { color: colors.foreground }]}>Ressources collectées !</Text>
            {collectResult.drops.length === 0 ? (
              <Text style={[styles.resultEmpty, { color: colors.mutedForeground }]}>Rien trouvé… réessayez !</Text>
            ) : (
              collectResult.drops.map((drop) => {
                const res = game.getResourceById(drop.resourceId);
                return (
                  <View key={drop.resourceId} style={styles.dropRow}>
                    <View style={[styles.dropDot, { backgroundColor: res?.color ?? colors.primary }]} />
                    <Text style={[styles.dropName, { color: colors.foreground }]}>
                      +{drop.quantity} {res?.name ?? drop.resourceId}
                    </Text>
                  </View>
                );
              })
            )}
            <TouchableOpacity
              style={[styles.resultBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                setShowCollectResult(false);
                setCollectResult({ drops: [], regionCompleted: false });
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }}
            >
              <Text style={[styles.resultBtnText, { color: colors.primaryForeground }]}>
                {collectResult.regionCompleted ? 'Incroyable !' : 'Super !'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 18, paddingBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 16, fontWeight: '800', letterSpacing: 3 },
  headerForgeName: { fontSize: 11, fontWeight: '500', letterSpacing: 1, marginTop: 1 },
  headerRight: { flexDirection: 'row', gap: 6 },
  headerBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16 },
  headerBadgeText: { fontSize: 11, fontWeight: '600' },
  marketShortcut: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 16 },
  marketShortcutText: { fontSize: 11, fontWeight: '800', color: '#000' },

  // Map
  mapWrapper: {},
  mapCanvas: { borderRadius: 14, overflow: 'hidden', position: 'relative' },
  gridLine: { position: 'absolute', backgroundColor: 'rgba(212,133,26,0.06)' },
  mapBorder: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 14, borderWidth: 1 },
  phaseLabel: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10 },
  phaseEmoji: { fontSize: 13 },
  phaseLabelText: { fontSize: 11, fontWeight: '600' },

  // Region nodes on map
  regionNode: { position: 'absolute', alignItems: 'center' },
  regionGlow: { position: 'absolute', borderWidth: 2 },
  regionCircle: { justifyContent: 'center', alignItems: 'center' },
  expRing: { position: 'absolute', overflow: 'hidden' },
  regionNodeName: { position: 'absolute', fontSize: 9, fontWeight: '600', textAlign: 'center' },

  // Region list
  listSection: {},
  listSectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 10 },
  regionRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 8, gap: 10 },
  regionRowInfo: { flex: 1 },
  regionRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  regionRowName: { fontSize: 14, fontWeight: '600' },
  unlockedBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  unlockedText: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  regionRowBiome: { fontSize: 11, marginTop: 2 },
  regionRowProgress: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5 },
  miniTrack: { flex: 1, height: 3, borderRadius: 2, overflow: 'hidden' },
  miniFill: { height: '100%', borderRadius: 2, minWidth: 2 },
  miniPct: { fontSize: 10, minWidth: 28 },
  levelReq: { fontSize: 11, marginTop: 2 },

  // Detail sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, borderWidth: 1, borderBottomWidth: 0 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  sheetTitle: { fontSize: 22, fontWeight: '700' },
  sheetBiome: { fontSize: 12, marginTop: 2 },
  detailExpRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  detailExpLabel: { fontSize: 11, width: 72 },
  detailExpTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  detailExpFill: { height: '100%', borderRadius: 3, minWidth: 3 },
  detailExpPct: { fontSize: 11, fontWeight: '700', minWidth: 30 },
  sheetDesc: { fontSize: 13, lineHeight: 19, marginBottom: 18 },
  sheetLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 10 },
  resourceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  resourceChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1, gap: 6 },
  resDot: { width: 8, height: 8, borderRadius: 4 },
  resName: { fontSize: 12 },
  resRate: { fontSize: 11 },
  bossCard: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 12, borderWidth: 1, gap: 10, marginBottom: 20 },
  bossName: { fontSize: 14, fontWeight: '600' },
  bossDesc: { fontSize: 11, marginTop: 2 },
  bossLevel: { fontSize: 14, fontWeight: '700' },
  sheetBtns: { flexDirection: 'row', gap: 12 },
  btnSecondary: { flex: 1, paddingVertical: 13, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7, borderWidth: 1 },
  btnSecondaryText: { fontSize: 13, fontWeight: '700' },
  btnExplore: { flex: 2, paddingVertical: 13, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 },
  btnExploreText: { fontSize: 14, fontWeight: '800', color: '#fff' },

  // Quick collect result
  completionBanner: { borderWidth: 1, borderRadius: 12, padding: 12, alignItems: 'center', gap: 6, width: '100%' },
  completionTitle: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  completionRewards: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
  completionRewardText: { fontSize: 14, fontWeight: '700' },
  resultBox: { margin: 40, borderRadius: 20, padding: 28, borderWidth: 1, alignItems: 'center', gap: 12 },
  resultTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  resultEmpty: { fontSize: 14, textAlign: 'center' },
  dropRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dropDot: { width: 10, height: 10, borderRadius: 5 },
  dropName: { fontSize: 15 },
  resultBtn: { marginTop: 8, paddingHorizontal: 32, paddingVertical: 13, borderRadius: 12 },
  resultBtnText: { fontSize: 15, fontWeight: '700' },

  // Explore view
  exploreHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12, gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  exploreHeaderCenter: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  exploreTitle: { fontSize: 18, fontWeight: '800' },
  exploreSubtitle: { fontSize: 11 },
  levelBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  levelBadgeText: { fontSize: 11, fontWeight: '700' },
  exploreProgress: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  expLabel: { fontSize: 11, width: 70 },
  expTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  expFill: { height: '100%', borderRadius: 3, minWidth: 3 },
  expPct: { fontSize: 11, fontWeight: '700', minWidth: 30 },
  bossStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 7, borderBottomWidth: 1 },
  bossStripText: { fontSize: 12, fontWeight: '600' },
  fightBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 6, borderRadius: 8 },
  fightBtnText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  enemiesStrip: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8, borderBottomWidth: 1, gap: 5 },
  enemiesLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 2, marginBottom: 2 },
  enemyRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth },
  enemyRowName: { flex: 1, fontSize: 12, fontWeight: '600' },
  enemyRowLevel: { fontSize: 12, fontWeight: '700' },
  nodesContent: { paddingHorizontal: 16, paddingTop: 14 },
  nodesTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 12 },
  nodeCard: { borderRadius: 12, borderWidth: 1, marginBottom: 8, overflow: 'hidden' },
  nodeTop: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 12 },
  nodeDot: { width: 32, height: 32, borderRadius: 16 },
  nodeInfo: { flex: 1 },
  nodeName: { fontSize: 14, fontWeight: '600', marginBottom: 3 },
  nodeMeta: { fontSize: 11 },
  nodeInv: { fontSize: 11, fontWeight: '600', marginTop: 3 },
  collectBtn: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  collectBtnText: { fontWeight: '800' },
  progressTrack: { height: 4, marginHorizontal: 14, marginBottom: 10, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  descCard: { borderRadius: 12, padding: 14, borderWidth: 1, marginTop: 10 },
  descLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  descText: { fontSize: 13, lineHeight: 19 },

  // Zone quest section
  zoneQuestRow: { borderRadius: 10, borderWidth: 1, padding: 11, marginBottom: 8 },
  zoneQuestTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  zoneQuestTitle: { fontSize: 13, fontWeight: '700', marginBottom: 2 },
  zoneQuestDesc: { fontSize: 11, lineHeight: 15 },
  zoneAcceptBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7 },
  zoneAcceptText: { fontSize: 11, fontWeight: '800' },
  zoneActiveBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  zoneActiveBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  zoneObjRow: { marginTop: 6, gap: 2 },
  zoneObjText: { fontSize: 11, flex: 1 },
  zoneObjCount: { fontSize: 11, fontWeight: '700' },
  zoneObjTrack: { height: 3, borderRadius: 2, marginTop: 2, overflow: 'hidden' },
  zoneObjFill: { height: '100%', borderRadius: 2, minWidth: 2 },
  zoneRewards: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 8, opacity: 0.75 },
  zoneRewardText: { fontSize: 11, fontWeight: '700' },
  weightBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1 },
  weightTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  weightFill: { height: '100%', borderRadius: 2, minWidth: 3 },
  weightText: { fontSize: 11, fontWeight: '600', minWidth: 80, textAlign: 'right' },
  toast: { position: 'absolute', bottom: 80, left: 20, right: 20, borderRadius: 12, borderWidth: 1, padding: 14 },
  toastContent: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toastDot: { width: 12, height: 12, borderRadius: 6 },
  toastText: { fontSize: 14, fontWeight: '600' },
  combatBox: { width: '88%', maxWidth: 390, borderRadius: 22, padding: 20, borderWidth: 1 },
  combatHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  combatEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 5 },
  combatTitle: { fontSize: 22, fontWeight: '900' },
  combatHint: { fontSize: 12, lineHeight: 18, marginTop: 10, marginBottom: 16 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  scoreCard: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1 },
  scoreLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  scoreValue: { fontSize: 34, fontWeight: '900', marginTop: 3 },
  vsText: { fontSize: 12, fontWeight: '900' },
  roundText: { textAlign: 'center', fontSize: 11, fontWeight: '700', marginTop: 16 },
  lastRoll: { borderRadius: 10, padding: 10, marginTop: 9 },
  lastRollText: { textAlign: 'center', fontSize: 12 },
  combatOutcome: { textAlign: 'center', fontSize: 20, fontWeight: '900', letterSpacing: 1, marginTop: 16 },
  combatMessage: { textAlign: 'center', fontSize: 13, lineHeight: 19, marginTop: 6 },
  combatDrops: { alignItems: 'center', gap: 4, marginTop: 12 },
  combatDropText: { fontSize: 13, fontWeight: '800' },
  combatAction: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 18 },
  combatActionText: { color: '#fff', fontSize: 14, fontWeight: '800' },

  // Hideout badges on map canvas
  hideoutBadgeBtn: { position: 'absolute', zIndex: 10, justifyContent: 'center', alignItems: 'center', width: 28, height: 28 },

  // Lore toast in ExploreView
  loreToast: { position: 'absolute', bottom: 130, left: 16, right: 16, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(200,140,60,0.3)', backgroundColor: 'rgba(20,14,8,0.92)', padding: 12, flexDirection: 'row', alignItems: 'flex-start', zIndex: 20 },
  loreToastText: { fontSize: 12, lineHeight: 18, flex: 1, fontStyle: 'italic' },
});

function RegionMinimap({
  regions, unlockedRegions, activeHideouts, playerLevel, onRegionPress, colors,
}: {
  regions: RegionData[];
  unlockedRegions: string[];
  activeHideouts: ActiveHideout[];
  playerLevel: number;
  onRegionPress: (region: RegionData) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const sorted = useMemo(
    () => [...regions].sort((a, b) => a.levelRequired - b.levelRequired),
    [regions],
  );
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={mmStyles.wrap} contentContainerStyle={mmStyles.row}>
      {sorted.map((region) => {
        const isUnlocked = unlockedRegions.includes(region.id);
        const hasHideout = activeHideouts.some((h) => h.regionId === region.id);
        const canAccess = playerLevel >= region.levelRequired;
        const rc = REGION_COLORS[region.id] ?? '#D4851A';
        return (
          <TouchableOpacity
            key={region.id}
            style={[
              mmStyles.tile,
              {
                backgroundColor: isUnlocked ? rc + '20' : 'rgba(20,14,8,0.7)',
                borderWidth: hasHideout ? 2 : 1,
                borderColor: hasHideout ? '#FFD700' : isUnlocked ? rc + '70' : colors.border,
              },
            ]}
            onPress={() => onRegionPress(region)}
            activeOpacity={0.75}
          >
            {hasHideout && (
              <View style={mmStyles.chestBadge}>
                <Text style={{ fontSize: 11 }}>📦</Text>
              </View>
            )}
            <MaterialCommunityIcons
              name={isUnlocked ? (REGION_ICONS[region.id] ?? 'map-marker') : 'lock'}
              size={20}
              color={isUnlocked ? rc : canAccess ? colors.accent : colors.mutedForeground}
            />
            <Text style={[mmStyles.tileLabel, { color: isUnlocked ? '#F2E4C4' : colors.mutedForeground }]} numberOfLines={1}>
              {region.name}
            </Text>
            {!isUnlocked && (
              <Text style={[mmStyles.reqLabel, { color: canAccess ? colors.accent : colors.mutedForeground }]}>
                Niv.{region.levelRequired}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const fouStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'center', alignItems: 'center' },
  box: { width: '82%', maxWidth: 320, borderRadius: 22, padding: 26, alignItems: 'center', gap: 10, borderWidth: 1 },
  chest: { fontSize: 52, lineHeight: 60, textAlign: 'center' },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  subtitle: { fontSize: 12, textAlign: 'center' },
  timerTrack: { width: '100%', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 6 },
  timerFill: { height: '100%', borderRadius: 4 },
  collectBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 14, marginTop: 4, width: '100%', justifyContent: 'center' },
  collectBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  resultReward: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  missText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  closeBtn: { paddingHorizontal: 24, paddingVertical: 11, borderRadius: 12, borderWidth: 1, marginTop: 4 },
  closeBtnText: { fontSize: 14, fontWeight: '700' },
});

function FouilleModal({
  visible, hideout, region, collectWindowMs, onCollect, onClose,
}: {
  visible: boolean;
  hideout: ActiveHideout | null;
  region: RegionData | null;
  collectWindowMs: number;
  onCollect: () => { success: boolean; rewards: { resourceId: string; qty: number }[] };
  onClose: () => void;
}) {
  const colors = useColors();
  const game = useGame();
  const [collected, setCollected] = useState(false);
  const [expired, setExpired] = useState(false);
  const [rewards, setRewards] = useState<{ resourceId: string; qty: number }[]>([]);
  const progress = useSharedValue(1);
  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.round(progress.value * 100)}%` as `${number}%`,
  }));
  const expiredRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) {
      setCollected(false);
      setExpired(false);
      setRewards([]);
      expiredRef.current = false;
      progress.value = 1;
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    setCollected(false);
    setExpired(false);
    setRewards([]);
    expiredRef.current = false;
    progress.value = 1;
    progress.value = withTiming(0, { duration: collectWindowMs, easing: Easing.linear });
    timerRef.current = setTimeout(() => {
      if (!expiredRef.current) {
        expiredRef.current = true;
        setExpired(true);
      }
    }, collectWindowMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCollect = () => {
    if (collected || expired) return;
    expiredRef.current = true;
    if (timerRef.current) clearTimeout(timerRef.current);
    const result = onCollect();
    if (result.success) {
      setRewards(result.rewards);
      setCollected(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      AudioManager.playCollect();
    } else {
      // Hideout expired between render and tap — show closable "trop tard" state
      setExpired(true);
    }
  };

  if (!visible || !hideout || !region) return null;
  const rc = REGION_COLORS[region.id] ?? colors.primary;
  const done = collected || expired;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={fouStyles.overlay}>
        <View style={[fouStyles.box, { backgroundColor: colors.card, borderColor: rc + '80' }]}>
          <Text style={fouStyles.chest}>📦</Text>
          <Text style={[fouStyles.title, { color: colors.foreground }]}>
            {done ? (collected ? 'Trésor trouvé !' : 'Trop tard…') : 'Cachette découverte !'}
          </Text>
          <Text style={[fouStyles.subtitle, { color: colors.mutedForeground }]}>{region.name}</Text>

          {!done && (
            <>
              <View style={[fouStyles.timerTrack, { backgroundColor: colors.muted }]}>
                <Animated.View style={[fouStyles.timerFill, progressStyle, { backgroundColor: rc }]} />
              </View>
              <TouchableOpacity
                style={[fouStyles.collectBtn, { backgroundColor: rc }]}
                onPress={handleCollect}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="bag-personal" size={18} color="#fff" />
                <Text style={fouStyles.collectBtnText}>Fouiller !</Text>
              </TouchableOpacity>
            </>
          )}

          {collected && rewards.length > 0 && rewards.map((r) => {
            const res = game.getResourceById(r.resourceId);
            return (
              <Text key={r.resourceId} style={[fouStyles.resultReward, { color: colors.accent }]}>
                +{r.qty} {res?.name ?? r.resourceId}
              </Text>
            );
          })}

          {expired && !collected && (
            <Text style={[fouStyles.missText, { color: colors.mutedForeground }]}>
              La cachette s'est refermée avant votre arrivée.
            </Text>
          )}

          {done && (
            <TouchableOpacity
              style={[fouStyles.closeBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              onPress={onClose}
            >
              <Text style={[fouStyles.closeBtnText, { color: colors.foreground }]}>Fermer</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}
