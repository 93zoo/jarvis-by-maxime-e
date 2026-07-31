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
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useGame } from '@/context/GameContext';
import { useColors } from '@/hooks/useColors';
import AudioManager from '@/utils/AudioManager';
import type { CraftOrder, RegionData, RegionResourceNode } from '@/types/game';

// ─── Region metadata ──────────────────────────────────────────────────────────
const REGION_COLORS: Record<string, string> = {
  village: '#4CAF50', forest: '#2E7D32', mountains: '#546E7A',
  mines: '#78909C', swamp: '#558B2F', desert: '#F9A825',
  ruins: '#6D4C41', port: '#0277BD', volcano: '#BF360C', castle: '#9C27B0',
};

const REGION_EMOJIS: Record<string, string> = {
  village: '🏘', forest: '🌲', mountains: '⛰', mines: '⛏',
  swamp: '🌿', desert: '🏜', ruins: '🏚', port: '⚓',
  volcano: '🌋', castle: '🏰',
};

// Map positions as fractions of map container width/height
const REGION_POSITIONS: Record<string, { x: number; y: number }> = {
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
];

// ─── Day / Night ─────────────────────────────────────────────────────────────
type DayPhase = 'night' | 'dawn' | 'day' | 'dusk';

function getPhase(hour: number): DayPhase {
  if (hour < 5 || hour >= 22) return 'night';
  if (hour < 7) return 'dawn';
  if (hour < 18) return 'day';
  return 'dusk';
}

const PHASE_CONFIG: Record<DayPhase, { label: string; emoji: string; tint: string }> = {
  night: { label: 'Nuit', emoji: '🌙', tint: 'rgba(0,0,50,0.52)' },
  dawn: { label: 'Aube', emoji: '🌅', tint: 'rgba(255,130,30,0.22)' },
  day: { label: 'Jour', emoji: '☀️', tint: 'rgba(0,0,0,0)' },
  dusk: { label: 'Crépuscule', emoji: '🌆', tint: 'rgba(190,70,10,0.28)' },
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

// ─── Region node on the map ───────────────────────────────────────────────────
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
          <Text style={{ fontSize: nodeSize * 0.42 }}>{REGION_EMOJIS[region.id] ?? '📍'}</Text>
        ) : (
          <Feather name="lock" size={nodeSize * 0.35} color={canUnlock ? colors.accent : colors.mutedForeground} />
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
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  const [collecting, setCollecting] = useState<string | null>(null);
  const [lastDrops, setLastDrops] = useState<{ resourceId: string; qty: number } | null>(null);
  const [showToast, setShowToast] = useState(false);
  const [showCombat, setShowCombat] = useState(false);
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
      setLastDrops(null);
      showDrop(null);
      setCooldowns((prev) => ({ ...prev, [key]: Date.now() + Math.round((RARITY_COOLDOWN[rarity] ?? 20000) / 4) }));
      return;
    }

    // Collect up to what fits (may be less than rolled on partial capacity)
    const finalQty = rolled > 0 ? Math.min(rolled, maxQtyByWeight) : 0;
    if (finalQty > 0) {
      game.addResource(node.resourceId, finalQty);
      setLastDrops({ resourceId: node.resourceId, qty: finalQty });
    } else {
      setLastDrops(null); // miss (rolled === 0)
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

  const openCombat = () => {
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
    const enemyRoll = Math.floor(Math.random() * 6) + 1 + Math.floor(region.boss.level / 5);
    const nextPlayerScore = combatPlayerScore + playerRoll;
    const nextEnemyScore = combatEnemyScore + enemyRoll;
    const nextRound = combatRound + 1;
    setCombatLastRoll({ player: playerRoll, enemy: enemyRoll });
    setCombatPlayerScore(nextPlayerScore);
    setCombatEnemyScore(nextEnemyScore);
    setCombatRound(nextRound);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (nextRound >= 3) {
      const result = game.fightForMaterials(region.id, nextPlayerScore, nextEnemyScore);
      setCombatResult(result);
      if (result.won) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
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
          <Text style={{ fontSize: 24 }}>{REGION_EMOJIS[region.id]}</Text>
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
      <View style={[styles.bossStrip, { backgroundColor: colors.destructive + '18', borderBottomColor: colors.destructive + '30' }]}>
        <Feather name="alert-triangle" size={13} color={colors.destructive} />
        <Text style={[styles.bossStripText, { color: colors.destructive, flex: 1 }]}>
          Boss: {region.boss.name} · Niv.{region.boss.level}
        </Text>
        <TouchableOpacity style={[styles.fightBtn, { backgroundColor: colors.destructive }]} onPress={openCombat}>
          <Feather name="target" size={13} color="#fff" />
          <Text style={styles.fightBtnText}>Combattre</Text>
        </TouchableOpacity>
      </View>

      {/* Resource nodes */}
      <ScrollView
        contentContainerStyle={[styles.nodesContent, { paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.nodesTitle, { color: colors.primary }]}>POINTS DE RESSOURCES</Text>
        {region.resourceNodes.map((node) => {
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
            <View
              key={node.resourceId}
              style={[
                styles.nodeCard,
                {
                  backgroundColor: colors.card,
                  borderColor: isCollecting ? rc : isOnCd ? colors.muted : colors.border,
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
            </View>
          );
        })}

        {/* Description */}
        <View style={[styles.descCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.descLabel, { color: colors.primary }]}>À PROPOS</Text>
          <Text style={[styles.descText, { color: colors.mutedForeground }]}>{region.description}</Text>
        </View>
      </ScrollView>

      {/* Weight bar */}
      <View style={[styles.weightBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
        <Feather name="package" size={12} color={colors.mutedForeground} />
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
                <Text style={[styles.combatTitle, { color: colors.foreground }]}>{region.boss.name}</Text>
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
  onRegionPress,
}: {
  mapWidth: number; mapHeight: number; gameHour: number;
  game: ReturnType<typeof useGame>;
  colors: ReturnType<typeof useColors>;
  onRegionPress: (region: RegionData) => void;
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

      {/* Day/night tint overlay */}
      {phase !== 'day' && (
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: phaseConf.tint, pointerEvents: 'none' }]} />
      )}

      {/* Phase indicator */}
      <View style={[styles.phaseLabel, { backgroundColor: 'rgba(10,8,16,0.75)' }]}>
        <Text style={styles.phaseEmoji}>{phaseConf.emoji}</Text>
        <Text style={[styles.phaseLabelText, { color: '#D4851A' }]}>
          {phaseConf.label} · {String(gameHour).padStart(2, '0')}h00
        </Text>
      </View>

      {/* Map border frame */}
      <View style={[styles.mapBorder, { borderColor: '#D4851A40', pointerEvents: 'none' }]} />
    </View>
  );
}

// ─── Market Section ───────────────────────────────────────────────────────────
const mStyles = StyleSheet.create({
  section: {},
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 10 },
  sectionTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 2, flex: 1 },
  sellMsg: { fontSize: 14, fontWeight: '700' },
  toggleText: { fontSize: 12, fontWeight: '600' },
  marketHint: { fontSize: 11, marginBottom: 10, lineHeight: 16 },
  emptyRow: { borderRadius: 10, borderWidth: 1, padding: 14 },
  emptyText: { fontSize: 12, textAlign: 'center' },
  marketRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 10, marginBottom: 8, gap: 10 },
  resDot: { width: 12, height: 12, borderRadius: 6 },
  resInfo: { flex: 1 },
  resName: { fontSize: 13, fontWeight: '600' },
  resStock: { fontSize: 11, marginTop: 1 },
  sellControls: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  qtyBtn: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  qtyText: { fontSize: 13, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  sellBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  sellBtnText: { fontSize: 11, fontWeight: '700' },
});

function MarketSection({ game, colors }: { game: ReturnType<typeof useGame>; colors: ReturnType<typeof useColors> }) {
  const [sellQtys, setSellQtys] = useState<Record<string, number>>({});
  const [lastSellMsg, setLastSellMsg] = useState<string | null>(null);
  const [showItems, setShowItems] = useState(false);

  const inventoryResources = game.inventory.filter((i) => i.quantity > 0);
  const sellableItems = game.craftedItems.slice(0, 10);

  const getQty = (id: string) => sellQtys[id] ?? 1;
  const setQty = (id: string, qty: number) => setSellQtys((prev) => ({ ...prev, [id]: qty }));

  const handleSellResource = (resourceId: string, qty: number) => {
    const earned = game.sellResource(resourceId, qty);
    if (earned > 0) {
      setLastSellMsg(`+${earned} 🪙`);
      setTimeout(() => setLastSellMsg(null), 1800);
      AudioManager.playCoin();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleSellItem = (instanceId: string) => {
    const earned = game.sellItem(instanceId);
    if (earned > 0) {
      setLastSellMsg(`+${earned} 🪙`);
      setTimeout(() => setLastSellMsg(null), 1800);
      AudioManager.playCoin();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  return (
    <View style={[mStyles.section, { paddingHorizontal: 16, marginTop: 16 }]}>
      <View style={mStyles.sectionHeader}>
        <Text style={[mStyles.sectionTitle, { color: colors.accent }]}>MARCHÉ</Text>
        {lastSellMsg && <Text style={[mStyles.sellMsg, { color: '#4CAF50' }]}>{lastSellMsg}</Text>}
        <TouchableOpacity onPress={() => setShowItems(!showItems)}>
          <Text style={[mStyles.toggleText, { color: colors.primary }]}>
            {showItems ? 'Ressources' : 'Objets forgés'}
          </Text>
        </TouchableOpacity>
      </View>

      {!showItems && (
        <>
          <Text style={[mStyles.marketHint, { color: colors.mutedForeground }]}>
            Ventes à 80% de la valeur marchande. Les prix fluctuent selon l'offre.
          </Text>
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
              const qty = getQty(inv.resourceId);
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
                    <TouchableOpacity style={[mStyles.qtyBtn, { backgroundColor: colors.secondary }]} onPress={() => setQty(inv.resourceId, Math.max(1, qty - 1))}>
                      <Feather name="minus" size={11} color={colors.foreground} />
                    </TouchableOpacity>
                    <Text style={[mStyles.qtyText, { color: colors.foreground }]}>{qty}</Text>
                    <TouchableOpacity style={[mStyles.qtyBtn, { backgroundColor: colors.secondary }]} onPress={() => setQty(inv.resourceId, Math.min(inv.quantity, qty + 1))}>
                      <Feather name="plus" size={11} color={colors.foreground} />
                    </TouchableOpacity>
                    <TouchableOpacity style={[mStyles.sellBtn, { backgroundColor: colors.primary }]} onPress={() => handleSellResource(inv.resourceId, qty)}>
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

      {showItems && (
        <>
          <Text style={[mStyles.marketHint, { color: colors.mutedForeground }]}>
            Ventes à 85% de la valeur d'estimation.
          </Text>
          {sellableItems.length === 0 ? (
            <View style={[mStyles.emptyRow, { borderColor: colors.border }]}>
              <Text style={[mStyles.emptyText, { color: colors.mutedForeground }]}>
                Aucun objet forgé. Forgez d'abord des objets.
              </Text>
            </View>
          ) : (
            sellableItems.map((item) => {
              const sellPrice = Math.round(item.value * 0.85);
              return (
                <View key={item.instanceId} style={[mStyles.marketRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={{ fontSize: 20 }}>⚒️</Text>
                  <View style={mStyles.resInfo}>
                    <Text style={[mStyles.resName, { color: colors.foreground }]}>{item.name}</Text>
                    <Text style={[mStyles.resStock, { color: colors.mutedForeground }]}>{item.category} · {item.quality} · {item.value}g</Text>
                  </View>
                  <TouchableOpacity style={[mStyles.sellBtn, { backgroundColor: colors.primary }]} onPress={() => handleSellItem(item.instanceId)}>
                    <Text style={[mStyles.sellBtnText, { color: colors.primaryForeground }]}>{sellPrice}g</Text>
                  </TouchableOpacity>
                </View>
              );
            })
          )}
        </>
      )}
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function WorldScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const game = useGame();
  const { width: screenWidth } = useWindowDimensions();

  const [selectedRegion, setSelectedRegion] = useState<RegionData | null>(null);
  const [exploringRegion, setExploringRegion] = useState<RegionData | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [gameHour, setGameHour] = useState(() => new Date().getHours());
  const [collectResult, setCollectResult] = useState<{ resourceId: string; quantity: number }[]>([]);
  const [showCollectResult, setShowCollectResult] = useState(false);

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

  const handleRegionPress = useCallback((region: RegionData) => {
    const isUnlocked = game.unlockedRegions.includes(region.id);
    if (isUnlocked) {
      setSelectedRegion(region);
      setShowDetail(true);
    } else if (game.player.level >= region.levelRequired) {
      // Auto-unlock with animation
      game.unlockRegion(region.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelectedRegion(region);
      setShowDetail(true);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [game]);

  const handleQuickCollect = useCallback(() => {
    if (!selectedRegion) return;
    AudioManager.playCollect();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const drops = game.collectFromRegion(selectedRegion.id);
    setShowDetail(false);
    setSelectedRegion(null);
    setCollectResult(drops);
    setShowCollectResult(true);
  }, [selectedRegion, game]);

  const handleExplore = useCallback(() => {
    if (!selectedRegion) return;
    setShowDetail(false);
    setExploringRegion(selectedRegion);
    setSelectedRegion(null);
  }, [selectedRegion]);

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
          <View style={[styles.headerBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.headerBadgeText, { color: colors.mutedForeground }]}>
              {phaseConf.emoji} {phaseConf.label}
            </Text>
          </View>
          <View style={[styles.headerBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.headerBadgeText, { color: colors.accent }]}>
              {game.unlockedRegions.length}/10 régions
            </Text>
          </View>
        </View>
      </LinearGradient>

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
                <Text style={{ fontSize: 20, marginRight: 2 }}>{isUnlocked ? REGION_EMOJIS[region.id] : '🔒'}</Text>
                <View style={styles.regionRowInfo}>
                  <View style={styles.regionRowTop}>
                    <Text style={[styles.regionRowName, { color: isUnlocked ? colors.foreground : colors.mutedForeground }]}>
                      {region.name}
                    </Text>
                    {isUnlocked && (
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

        {/* ── Market section ── */}
        <MarketSection game={game} colors={colors} />
      </ScrollView>

      {/* ── Region detail sheet ── */}
      <Modal visible={showDetail && !!selectedRegion} transparent animationType="slide" statusBarTranslucent>
        {selectedRegion && (
          <View style={styles.overlay}>
            <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: REGION_COLORS[selectedRegion.id] ?? colors.border }]}>
              <View style={[styles.handle, { backgroundColor: colors.muted }]} />

              {/* Region header */}
              <View style={styles.sheetHeader}>
                <Text style={{ fontSize: 36 }}>{REGION_EMOJIS[selectedRegion.id]}</Text>
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

              {/* Boss */}
              <Text style={[styles.sheetLabel, { color: colors.primary }]}>BOSS</Text>
              <View style={[styles.bossCard, { backgroundColor: colors.secondary, borderColor: colors.destructive + '40' }]}>
                <Text style={{ fontSize: 20 }}>👹</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bossName, { color: colors.foreground }]}>{selectedRegion.boss.name}</Text>
                  <Text style={[styles.bossDesc, { color: colors.mutedForeground }]}>{selectedRegion.boss.description}</Text>
                </View>
                <Text style={[styles.bossLevel, { color: colors.destructive }]}>Niv.{selectedRegion.boss.level}</Text>
              </View>

              {/* Buttons */}
              <View style={styles.sheetBtns}>
                <TouchableOpacity
                  style={[styles.btnSecondary, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                  onPress={handleQuickCollect}
                >
                  <Feather name="package" size={15} color={colors.accent} />
                  <Text style={[styles.btnSecondaryText, { color: colors.accent }]}>Collecte rapide</Text>
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
          <View style={[styles.resultBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ fontSize: 36, textAlign: 'center' }}>🎒</Text>
            <Text style={[styles.resultTitle, { color: colors.foreground }]}>Ressources collectées !</Text>
            {collectResult.length === 0 ? (
              <Text style={[styles.resultEmpty, { color: colors.mutedForeground }]}>Rien trouvé… réessayez !</Text>
            ) : (
              collectResult.map((drop) => {
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
              onPress={() => { setShowCollectResult(false); setCollectResult([]); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }}
            >
              <Text style={[styles.resultBtnText, { color: colors.primaryForeground }]}>Super !</Text>
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
});
