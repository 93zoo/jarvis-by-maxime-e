import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
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
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useGame } from '@/context/GameContext';
import { useColors } from '@/hooks/useColors';
import type { Item, Quality, RecipeData } from '@/types/game';
import ForgeScene3D, { CraftPhase, ForgeScene3DRef } from '@/components/ForgeScene3D';
import HammeringMiniGame, { HitLabel } from '@/components/HammeringMiniGame';
import WeatherEffect, { WeatherType } from '@/components/WeatherEffect';
import AudioManager from '@/utils/AudioManager';
import { applyStoredAudioSettings } from '@/utils/audioSettings';

// ─── Quality helpers ─────────────────────────────────────────────────────────
function qualityColor(q: Quality, colors: ReturnType<typeof useColors>): string {
  switch (q) {
    case 'legendary': return '#9966CC';
    case 'excellent': return colors.accent;
    case 'good': return colors.primary;
    case 'normal': return colors.foreground;
    case 'poor': return colors.mutedForeground;
  }
}

function qualityLabel(q: Quality): string {
  switch (q) {
    case 'legendary': return 'LÉGENDAIRE';
    case 'excellent': return 'EXCELLENT';
    case 'good': return 'BON';
    case 'normal': return 'NORMAL';
    case 'poor': return 'MÉDIOCRE';
  }
}

/** Score threshold needed to reliably achieve each quality (mirrors qualityFromScore). */
const QUALITY_SCORE_THRESHOLD: Record<Quality, number> = {
  poor: 0, normal: 40, good: 60, excellent: 80, legendary: 95,
};

/**
 * How achievable is the required quality given the player's current forge skill?
 * Uses the same base-score formula as the crafting engine:
 *   typicalScore = 30 + floor(forgeSkill × 0.7)
 * Returns:
 *   'reachable'   – typical score already meets the threshold (green)
 *   'stretch'     – a good roll (≤20 pts above typical) could meet it (orange)
 *   'unreachable' – very unlikely without significant skill gains (red)
 */
function qualityReachability(minQuality: Quality, forgeSkill: number): 'reachable' | 'stretch' | 'unreachable' {
  const typicalScore = 30 + Math.floor(forgeSkill * 0.7);
  const threshold = QUALITY_SCORE_THRESHOLD[minQuality] ?? 0;
  if (typicalScore >= threshold) return 'reachable';
  if (typicalScore + 20 >= threshold) return 'stretch';
  return 'unreachable';
}

function reachabilityColor(r: 'reachable' | 'stretch' | 'unreachable'): string {
  switch (r) {
    case 'reachable': return '#2E7D32';   // dark green
    case 'stretch': return '#E65100';     // dark orange
    case 'unreachable': return '#B71C1C'; // dark red
  }
}

function reachabilityBgColor(r: 'reachable' | 'stretch' | 'unreachable'): string {
  switch (r) {
    case 'reachable': return '#E8F5E9';
    case 'stretch': return '#FFF3E0';
    case 'unreachable': return '#FFEBEE';
  }
}

function reachabilityLabel(r: 'reachable' | 'stretch' | 'unreachable'): string {
  switch (r) {
    case 'reachable': return '✓ Réalisable';
    case 'stretch': return '~ Difficile';
    case 'unreachable': return '✗ Hors portée';
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface CraftSession {
  recipeId: string;
  strikesCompleted: number;
  strikeScores: number[];
}

const EMPTY_SESSION: CraftSession = { recipeId: '', strikesCompleted: 0, strikeScores: [] };

// ─── Forge Events ─────────────────────────────────────────────────────────────
interface ForgeEvent {
  id: string;
  emoji: string;
  name: string;
  description: string;
  effect: 'bonus_score' | 'min_score' | 'strike_multiplier';
  value: number;
  color: string;
  weight: number;
}

const FORGE_EVENTS: ForgeEvent[] = [
  {
    id: 'metal_en_fusion',
    emoji: '🔥',
    name: 'Métal en fusion',
    description: '+12 au score de qualité final',
    effect: 'bonus_score',
    value: 12,
    color: '#FF7043',
    weight: 35,
  },
  {
    id: 'inspiration',
    emoji: '⚡',
    name: 'Inspiration !',
    description: 'Les frappes comptent ×1.5',
    effect: 'strike_multiplier',
    value: 1.5,
    color: '#FFD54F',
    weight: 28,
  },
  {
    id: 'metal_elu',
    emoji: '🌟',
    name: 'Métal élu',
    description: 'Score de qualité minimum 65',
    effect: 'min_score',
    value: 65,
    color: '#81D4FA',
    weight: 22,
  },
  {
    id: 'grace_divine',
    emoji: '💎',
    name: 'Grâce divine',
    description: 'Score de qualité minimum 82 (Excellent garanti)',
    effect: 'min_score',
    value: 82,
    color: '#CE93D8',
    weight: 10,
  },
  {
    id: 'fievre',
    emoji: '🌪',
    name: 'Fièvre du forgeron',
    description: '+28 au score de qualité final',
    effect: 'bonus_score',
    value: 28,
    color: '#EF5350',
    weight: 5,
  },
];

const EVENT_CHANCE = 0.42; // 42 % de chance par craft

function rollForgeEvent(): ForgeEvent | null {
  if (Math.random() > EVENT_CHANCE) return null;
  const totalWeight = FORGE_EVENTS.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * totalWeight;
  for (const e of FORGE_EVENTS) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return FORGE_EVENTS[0];
}

// ─── Orders Modal ─────────────────────────────────────────────────────────────
const QUALITY_ORDER_UI: Record<string, number> = { poor: 0, normal: 1, good: 2, excellent: 3, legendary: 4 };

const oStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    height: '82%',
    maxHeight: '85%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  content: { flex: 1, minHeight: 0 },
  list: { flex: 1 },
  title: { flex: 1, fontSize: 18, fontWeight: '700' },
  msgBanner: { borderRadius: 8, padding: 10, marginBottom: 10 },
  msgText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  backText: { fontSize: 13 },
  deliverTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  deliverSubtitle: { fontSize: 12, marginBottom: 12 },
  emptyBox: { borderRadius: 12, padding: 20, alignItems: 'center', gap: 10 },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  itemRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 12, borderWidth: 1, marginBottom: 8, gap: 10 },
  itemName: { fontSize: 14, fontWeight: '600' },
  itemMeta: { fontSize: 11, marginTop: 2 },
  deliverBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  deliverBtnText: { fontSize: 13, fontWeight: '700' },
  orderCard: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 10 },
  orderCardTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  orderNPC: { fontSize: 14, fontWeight: '700' },
  orderType: { fontSize: 11, marginTop: 1 },
  rewardBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10 },
  rewardText: { fontSize: 14, fontWeight: '700' },
  orderRequest: { fontSize: 13, fontWeight: '600', marginBottom: 3 },
  orderMeta: { fontSize: 11, marginBottom: 6 },
  orderMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  qualityBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, gap: 3 },
  qualityBadgeText: { fontSize: 10, fontWeight: '700' },
  qualityBadgeLabel: { fontSize: 10, fontWeight: '600' },
  orderBtns: { flexDirection: 'row', gap: 10 },
  btnAccept: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  btnRefuse: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  btnText: { fontSize: 14, fontWeight: '700' },
});

function OrdersModal({
  visible, onClose, game, colors, bottomPad, deliverOrderId, setDeliverOrderId,
}: {
  visible: boolean;
  onClose: () => void;
  game: ReturnType<typeof useGame>;
  colors: ReturnType<typeof useColors>;
  bottomPad: number;
  deliverOrderId: string | null;
  setDeliverOrderId: (id: string | null) => void;
}) {
  const [deliverMsg, setDeliverMsg] = useState<string | null>(null);
  const pendingOrders = game.activeOrders.filter((o) => !o.completed);
  const selectedOrder = deliverOrderId ? pendingOrders.find((o) => o.id === deliverOrderId) : null;

  const handleDeliver = (itemInstanceId: string) => {
    if (!deliverOrderId) return;
    const result = game.deliverOrder(deliverOrderId, itemInstanceId);
    setDeliverMsg(result.message);
    if (result.success) {
      setDeliverOrderId(null);
      setTimeout(() => setDeliverMsg(null), 2000);
      AudioManager.playQuestComplete();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setTimeout(() => setDeliverMsg(null), 2500);
    }
  };

  const eligibleItems = selectedOrder
    ? game.craftedItems.filter((i) => {
        if (i.category !== selectedOrder.requestedCategory) return false;
        return QUALITY_ORDER_UI[i.quality] >= QUALITY_ORDER_UI[selectedOrder.minQuality];
      })
    : [];

  const deadlineLabel = (deadline: number) => {
    const diff = deadline - Date.now();
    if (diff <= 0) return 'Expiré';
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    return h > 0 ? `${h}h${m}m` : `${m}m`;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={[oStyles.overlay, { backgroundColor: 'rgba(0,0,0,0.88)' }]}>
        <View style={[oStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[oStyles.handle, { backgroundColor: colors.muted }]} />
          <View style={oStyles.headerRow}>

            <Feather name="inbox" size={18} color={colors.accent} />
            <Text style={[oStyles.title, { color: colors.foreground }]}>COMMANDES CLIENTS</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {deliverMsg && (
            <View style={[oStyles.msgBanner, { backgroundColor: deliverMsg.includes('succès') ? '#1B5E20' : '#B71C1C' }]}>
              <Text style={[oStyles.msgText, { color: '#fff' }]}>{deliverMsg}</Text>
            </View>
          )}

          {deliverOrderId && selectedOrder ? (
            <View style={oStyles.content}>
              <TouchableOpacity style={oStyles.backRow} onPress={() => setDeliverOrderId(null)}>
                <Feather name="arrow-left" size={14} color={colors.mutedForeground} />
                <Text style={[oStyles.backText, { color: colors.mutedForeground }]}>Retour aux commandes</Text>
              </TouchableOpacity>
              <Text style={[oStyles.deliverTitle, { color: colors.foreground }]}>
                {selectedOrder.npcEmoji} Choisir l'objet pour {selectedOrder.npcName}
              </Text>
              <Text style={[oStyles.deliverSubtitle, { color: colors.mutedForeground }]}>
                Catégorie: {selectedOrder.requestedCategory} · Min. qualité: {selectedOrder.minQuality}
              </Text>
              {eligibleItems.length === 0 ? (
                <View style={[oStyles.emptyBox, { backgroundColor: colors.secondary }]}>
                  <Feather name="tool" size={24} color={colors.mutedForeground} />
                  <Text style={[oStyles.emptyText, { color: colors.mutedForeground }]}>
                    Aucun objet éligible. Forgez un(e) {selectedOrder.requestedCategory} de qualité ≥ {selectedOrder.minQuality}.
                  </Text>
                </View>
              ) : (
                <FlatList
                  style={oStyles.list}
                  data={eligibleItems}
                  keyExtractor={(i) => i.instanceId}
                  contentContainerStyle={{ paddingBottom: bottomPad }}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={[oStyles.itemRow, { backgroundColor: colors.secondary, borderColor: colors.primary }]}
                      onPress={() => handleDeliver(item.instanceId)}
                      activeOpacity={0.8}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[oStyles.itemName, { color: colors.foreground }]}>{item.name}</Text>
                        <Text style={[oStyles.itemMeta, { color: colors.mutedForeground }]}>{item.category} · {item.quality} · {item.value}g</Text>
                      </View>
                      <View style={[oStyles.deliverBtn, { backgroundColor: colors.primary }]}>
                        <Text style={[oStyles.deliverBtnText, { color: colors.primaryForeground }]}>Livrer</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          ) : (
            <FlatList
              style={oStyles.list}
              data={pendingOrders}
              keyExtractor={(o) => o.id}
              contentContainerStyle={{ paddingBottom: bottomPad }}
              ListEmptyComponent={
                <View style={[oStyles.emptyBox, { backgroundColor: colors.secondary }]}>
                  <Feather name="clock" size={24} color={colors.mutedForeground} />
                  <Text style={[oStyles.emptyText, { color: colors.mutedForeground }]}>
                    Aucune commande en attente. De nouvelles commandes arrivent toutes les 3 minutes !
                  </Text>
                </View>
              }
              renderItem={({ item: order }) => {
                const expired = order.deadline < Date.now();
                return (
                  <View style={[oStyles.orderCard, { backgroundColor: colors.secondary, borderColor: order.accepted ? colors.primary : colors.border }]}>
                    <View style={oStyles.orderCardTop}>
                      <Text style={{ fontSize: 24 }}>{order.npcEmoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[oStyles.orderNPC, { color: colors.foreground }]}>{order.npcName}</Text>
                        <Text style={[oStyles.orderType, { color: colors.mutedForeground }]}>
                          {order.npcType} · {deadlineLabel(order.deadline)}
                          {expired && <Text style={{ color: '#F44336' }}> EXPIRÉ</Text>}
                        </Text>
                      </View>
                      <View style={[oStyles.rewardBadge, { backgroundColor: colors.card }]}>
                        <Text style={[oStyles.rewardText, { color: colors.accent }]}>{order.goldReward}g</Text>
                      </View>
                    </View>
                    <Text style={[oStyles.orderRequest, { color: colors.foreground }]}>Commande : {order.requestedName}</Text>
                    <Text style={[oStyles.orderMeta, { color: colors.mutedForeground }]}>
                      {order.requestedCategory} · +{order.xpReward} XP
                    </Text>
                    {(() => {
                      const reach = qualityReachability(order.minQuality, game.player.skills.forge ?? 1);
                      const bgColor = reachabilityBgColor(reach);
                      const fgColor = reachabilityColor(reach);
                      return (
                        <View style={oStyles.orderMetaRow}>
                          <Text style={[oStyles.orderMeta, { color: colors.mutedForeground, marginBottom: 0 }]}>
                            Qualité min. :
                          </Text>
                          <View style={[oStyles.qualityBadge, { backgroundColor: bgColor }]}>
                            <Text style={[oStyles.qualityBadgeText, { color: fgColor }]}>
                              {qualityLabel(order.minQuality)}
                            </Text>
                          </View>
                          <View style={[oStyles.qualityBadge, { backgroundColor: bgColor + 'CC' }]}>
                            <Text style={[oStyles.qualityBadgeLabel, { color: fgColor }]}>
                              {reachabilityLabel(reach)}
                            </Text>
                          </View>
                        </View>
                      );
                    })()}
                    {!expired && (
                      <View style={oStyles.orderBtns}>
                        {!order.accepted ? (
                          <>
                            <TouchableOpacity
                              style={[oStyles.btnAccept, { backgroundColor: colors.primary }]}
                              onPress={() => { game.acceptOrder(order.id); AudioManager.playCollect(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                            >
                              <Text style={[oStyles.btnText, { color: colors.primaryForeground }]}>Accepter</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[oStyles.btnRefuse, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                              onPress={() => { game.refuseOrder(order.id); AudioManager.playClick(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                            >
                              <Text style={[oStyles.btnText, { color: colors.mutedForeground }]}>Refuser</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[oStyles.btnRefuse, { backgroundColor: colors.secondary, borderColor: colors.accent + '60' }]}
                              onPress={() => {
                                const result = game.rerollOrder(order.id);
                                if (!result.success) {
                                  setDeliverMsg(`Or insuffisant (${result.cost}g requis pour relancer)`);
                                  setTimeout(() => setDeliverMsg(null), 2500);
                                } else {
                                  AudioManager.playClick();
                                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                }
                              }}
                            >
                              <Feather name="refresh-cw" size={11} color={colors.accent} />
                              <Text style={[oStyles.btnText, { color: colors.accent }]}>{Math.max(30, game.player.level * 8)}g</Text>
                            </TouchableOpacity>
                          </>
                        ) : (
                          <TouchableOpacity
                            style={[oStyles.btnAccept, { backgroundColor: colors.accent }]}
                            onPress={() => setDeliverOrderId(order.id)}
                          >
                            <Feather name="package" size={13} color="#000" />
                            <Text style={[oStyles.btnText, { color: '#000' }]}>Livrer</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Forge Upgrades Modal ─────────────────────────────────────────────────────
const ELEMENT_EMOJI: Record<string, string> = {
  forge_main: '🔥', furnace: '🏭', anvil: '⚒️', workbench: '🪵', decoration: '🎨', storage: '📦',
};

const fuStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '87%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1, borderBottomWidth: 0 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  fuTitle: { flex: 1, fontSize: 17, fontWeight: '700' },
  msgBanner: { borderRadius: 8, padding: 10, marginBottom: 10 },
  msgText: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  elementCard: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 10 },
  elementTop: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  elementEmoji: { fontSize: 22, width: 36, textAlign: 'center' },
  elementInfo: { flex: 1 },
  elementName: { fontSize: 14, fontWeight: '700' },
  elementBonus: { fontSize: 11, marginTop: 2, lineHeight: 16 },
  levelStars: { flexDirection: 'row', gap: 3 },
  costRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 },
  costChip: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  costText: { fontSize: 11, fontWeight: '600' },
  upgradeBtn: { paddingVertical: 11, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  upgradeBtnText: { fontSize: 13, fontWeight: '700' },
});

function ForgeUpgradesModal({
  visible, onClose, game, colors, bottomPad,
}: {
  visible: boolean;
  onClose: () => void;
  game: ReturnType<typeof useGame>;
  colors: ReturnType<typeof useColors>;
  bottomPad: number;
}) {
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const handleUpgrade = (elementId: string) => {
    const result = game.upgradeForgeElement(elementId);
    setMsg({ text: result.message, ok: result.success });
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setTimeout(() => setMsg(null), 2500);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={fuStyles.overlay}>
        <View style={[fuStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[fuStyles.handle, { backgroundColor: colors.muted }]} />
          <View style={fuStyles.headerRow}>
            <Feather name="settings" size={18} color={colors.accent} />
            <Text style={[fuStyles.fuTitle, { color: colors.foreground }]}>AMÉLIORATIONS</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          {msg && (
            <View style={[fuStyles.msgBanner, { backgroundColor: msg.ok ? '#1B5E20' : '#B71C1C' }]}>
              <Text style={[fuStyles.msgText, { color: '#fff' }]}>{msg.text}</Text>
            </View>
          )}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad + 20 }}>
            {game.allForgeUpgrades.map((upgradeData) => {
              const currentLevel = game.forgeUpgrades[upgradeData.id] ?? 0;
              const isMaxed = currentLevel >= 5;
              const nextTier = isMaxed ? null : upgradeData.tiers[currentLevel];
              const currentBonus = currentLevel > 0
                ? upgradeData.tiers[currentLevel - 1]?.bonus
                : upgradeData.description;
              const costReduction = Math.min(0.5, game.getTalentBonus('upgradeCostReduction'));
              const goldCost = nextTier ? Math.round(nextTier.goldCost * (1 - costReduction)) : 0;
              const canAfford = !isMaxed && !!nextTier &&
                game.player.gold >= goldCost &&
                nextTier.resourceCosts.every((rc) => game.getInventoryQty(rc.resourceId) >= rc.qty);
              return (
                <View
                  key={upgradeData.id}
                  style={[fuStyles.elementCard, { backgroundColor: colors.secondary, borderColor: canAfford ? colors.primary : colors.border }]}
                >
                  <View style={fuStyles.elementTop}>
                    <Text style={fuStyles.elementEmoji}>{ELEMENT_EMOJI[upgradeData.id] ?? '🔧'}</Text>
                    <View style={fuStyles.elementInfo}>
                      <Text style={[fuStyles.elementName, { color: colors.foreground }]}>{upgradeData.name}</Text>
                      <Text style={[fuStyles.elementBonus, { color: colors.mutedForeground }]}>
                        {isMaxed ? '✦ MAX — ' : ''}{currentBonus}
                      </Text>
                    </View>
                    <View style={fuStyles.levelStars}>
                      {[0, 1, 2, 3, 4].map((i) => (
                        <Feather key={i} name="star" size={11} color={i < currentLevel ? colors.accent : colors.muted} />
                      ))}
                    </View>
                  </View>
                  {!isMaxed && nextTier && (
                    <>
                      <Text style={[fuStyles.elementBonus, { color: colors.mutedForeground, marginBottom: 6 }]}>
                        Prochain bonus: {nextTier.bonus}
                      </Text>
                      <View style={fuStyles.costRow}>
                        <View style={[fuStyles.costChip, { backgroundColor: `${colors.accent}22` }]}>
                          <Text style={[fuStyles.costText, { color: colors.accent }]}>💰 {goldCost.toLocaleString()}g</Text>
                        </View>
                        {nextTier.resourceCosts.map((rc) => {
                          const res = game.allResources.find((r) => r.id === rc.resourceId);
                          const have = game.getInventoryQty(rc.resourceId);
                          const ok = have >= rc.qty;
                          return (
                            <View
                              key={rc.resourceId}
                              style={[fuStyles.costChip, { backgroundColor: ok ? `${colors.primary}22` : `${colors.destructive}22` }]}
                            >
                              <Text style={[fuStyles.costText, { color: ok ? colors.primary : colors.destructive }]}>
                                {have}/{rc.qty} {res?.name ?? rc.resourceId}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                      <TouchableOpacity
                        style={[fuStyles.upgradeBtn, { backgroundColor: canAfford ? colors.primary : colors.muted, opacity: canAfford ? 1 : 0.5 }]}
                        onPress={() => handleUpgrade(upgradeData.id)}
                        disabled={!canAfford}
                      >
                        <Text style={[fuStyles.upgradeBtnText, { color: canAfford ? colors.primaryForeground : colors.mutedForeground }]}>
                          Améliorer → Niveau {currentLevel + 1}
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Avatar Circle ───────────────────────────────────────────────────────────
function AvatarCircle({
  color,
  icon,
  name,
  size = 32,
}: {
  color?: string;
  icon?: string | null;
  name: string;
  size?: number;
}) {
  const bgColor = color ?? '#F59E0B';
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bgColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {icon ? (
        <Feather name={icon as React.ComponentProps<typeof Feather>['name']} size={Math.round(size * 0.5)} color="#fff" />
      ) : (
        <Text style={{ color: '#fff', fontSize: Math.round(size * 0.45), fontWeight: '800', lineHeight: Math.round(size * 0.55) }}>
          {initial}
        </Text>
      )}
    </View>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function ForgeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const game = useGame();

  const [craftPhase, setCraftPhase] = useState<CraftPhase>('IDLE');
  const [session, setSession] = useState<CraftSession>(EMPTY_SESSION);
  const [heatingProgress, setHeatingProgress] = useState(0);
  const [craftedItem, setCraftedItem] = useState<Item | null>(null);
  const [showRecipeSheet, setShowRecipeSheet] = useState(false);
  const [lastHitLabel, setLastHitLabel] = useState<HitLabel | null>(null);
  const [showOrdersModal, setShowOrdersModal] = useState(false);
  const [deliverOrderId, setDeliverOrderId] = useState<string | null>(null);
  const [showUpgradesModal, setShowUpgradesModal] = useState(false);
  const [weather, setWeather] = useState<WeatherType>('none');
  const [activeForgeEvent, setActiveForgeEvent] = useState<ForgeEvent | null>(null);
  const [showEventBanner, setShowEventBanner] = useState(false);

  const sceneRef = useRef<ForgeScene3DRef>(null);
  const hitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const headerTopPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 80;

  // Init audio on mount + weather cycle + forge ambience
  useEffect(() => {
    AudioManager.init();
    // Restore saved mute/volume before starting ambience
    applyStoredAudioSettings();
    // Start the looping fire-crackle ambience when the forge tab is entered
    AudioManager.startForgeAmbience();

    // Web: use the Page Visibility API to suspend/resume the AudioContext so
    // the oscillator graph stays alive and there is no audible gap on return.
    let removeVisibility: (() => void) | undefined;
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const handleVisibilityChange = () => {
        if (document.hidden) {
          AudioManager.suspendForgeAmbience();
        } else {
          AudioManager.resumeForgeAmbience();
        }
      };
      document.addEventListener('visibilitychange', handleVisibilityChange);
      removeVisibility = () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }

    // Native: pause/resume ambience when the app goes to the background.
    // (On web AppState doesn't fire for tab switches — visibilitychange handles that above.)
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (Platform.OS !== 'web') {
        if (nextState === 'active') {
          AudioManager.startForgeAmbience();
        } else {
          AudioManager.stopForgeAmbience();
        }
      }
    });

    // Randomly assign atmospheric weather — changes every 5–10 minutes
    const WEATHER_TYPES: WeatherType[] = ['none', 'none', 'none', 'rain', 'fog', 'rain', 'snow'];
    const pick = () => WEATHER_TYPES[Math.floor(Math.random() * WEATHER_TYPES.length)];
    setWeather(pick());
    const weatherTimer = setInterval(() => setWeather(pick()), 7 * 60 * 1000); // 7 min
    return () => {
      removeVisibility?.();
      appStateSub.remove();
      clearInterval(weatherTimer);
      AudioManager.stopForgeAmbience();
    };
  }, []);

  // ─── Phase machine ───────────────────────────────────────────────────────
  useEffect(() => {
    if (craftPhase !== 'HEATING') return;
    const start = Date.now();
    setHeatingProgress(0);

    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / 3200;
      const clamped = Math.min(1, elapsed);
      setHeatingProgress(clamped);
      if (clamped >= 1) {
        clearInterval(interval);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setShowEventBanner(true); // reveal event banner when hammering starts
        setCraftPhase('HAMMERING');
      }
    }, 40);

    return () => clearInterval(interval);
  }, [craftPhase]);

  useEffect(() => {
    if (craftPhase !== 'COOLING') return;
    const timer = setTimeout(() => {
      const { strikeScores, strikesCompleted, recipeId } = session;
      const totalStrikeScore = strikeScores.reduce((a, b) => a + b, 0);
      const maxScore = strikesCompleted * 25;
      // Apply strike_multiplier event before ratio
      const strikeMultiplier = activeForgeEvent?.effect === 'strike_multiplier' ? activeForgeEvent.value : 1;
      const effectiveStrikeScore = Math.min(maxScore, totalStrikeScore * strikeMultiplier);
      const miniGameBonus = maxScore > 0 ? (effectiveStrikeScore / maxScore) * 50 : 25;
      const forgeBonus = Math.min(40, (game.player.skills['forge'] ?? 1) * 4);
      let qualityScore = Math.min(100, Math.round(10 + forgeBonus + miniGameBonus));
      // Apply event modifiers
      if (activeForgeEvent?.effect === 'bonus_score') qualityScore = Math.min(100, qualityScore + activeForgeEvent.value);
      if (activeForgeEvent?.effect === 'min_score')   qualityScore = Math.max(qualityScore, activeForgeEvent.value);

      const item = game.craftItemWithScore(recipeId, qualityScore);
      if (item) {
        setCraftedItem(item);
        AudioManager.playCraftComplete();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      setCraftPhase('RESULT');
    }, 1800);

    return () => clearTimeout(timer);
  }, [craftPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Actions ─────────────────────────────────────────────────────────────
  const startCraft = (recipe: RecipeData) => {
    if (!game.canCraftRecipe(recipe.id)) return;
    setShowRecipeSheet(false);
    setSession({ recipeId: recipe.id, strikesCompleted: 0, strikeScores: [] });
    setHeatingProgress(0);
    setCraftedItem(null);
    // Roll for a random forge event
    const evt = rollForgeEvent();
    setActiveForgeEvent(evt);
    setShowEventBanner(false);
    setCraftPhase('HEATING');
    AudioManager.startForgeAmbience();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const handleStrike = (score: number, label: HitLabel) => {
    sceneRef.current?.triggerHammerStrike();
    setLastHitLabel(label);
    if (hitTimerRef.current) clearTimeout(hitTimerRef.current);
    hitTimerRef.current = setTimeout(() => setLastHitLabel(null), 900);

    // Sound feedback based on strike quality
    if (score === 25) {
      AudioManager.playPerfectStrike();
    } else if (score >= 14) {
      AudioManager.playHammerStrike();
    } else if (score > 0) {
      AudioManager.playHammerStrike();
    } else {
      AudioManager.playError();
    }

    setSession((prev) => {
      const newStrikes = prev.strikesCompleted + 1;
      const newScores = [...prev.strikeScores, score];
      if (newStrikes >= 5) {
        setTimeout(() => {
          setCraftPhase('COOLING');
        }, 400);
      }
      return { ...prev, strikesCompleted: newStrikes, strikeScores: newScores };
    });
  };

  const resetCraft = () => {
    setCraftPhase('IDLE');
    setSession(EMPTY_SESSION);
    setCraftedItem(null);
    setHeatingProgress(0);
    setLastHitLabel(null);
  };

  if (!game.isLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const { player } = game;
  const forgeSkillLevel = player.skills['forge'] ?? 1;
  const forgeXP = player.skillXP['forge'] ?? 0;
  const forgeXPNeeded = forgeSkillLevel * 50;
  const forgeXPPct = Math.min(100, Math.floor((forgeXP / forgeXPNeeded) * 100));
  const xpPct = Math.min(100, Math.floor((player.xp / player.xpToNextLevel) * 100));
  const availableRecipes = game.getAvailableRecipes();
  const selectedRecipe = session.recipeId ? game.getRecipeById(session.recipeId) : null;
  const pendingOrders = game.activeOrders.filter((o) => !o.completed);
  const pendingCount = pendingOrders.length;
  const upgradeLevel = Object.values(game.forgeUpgrades).reduce((a, b) => a + b, 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <LinearGradient
        colors={[colors.card as string, 'transparent']}
        style={[styles.header, { paddingTop: headerTopPad + 12 }]}
      >
        <View style={styles.headerLeft}>
          <AvatarCircle color={player.avatarColor} icon={player.avatarIcon} name={player.name} size={34} />
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>LA FORGE</Text>
            {player.forgeName ? (
              <Text style={[styles.headerForgeName, { color: colors.mutedForeground }]} numberOfLines={1}>
                {player.forgeName}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.pill, { backgroundColor: colors.secondary }]}>
            <Feather name="dollar-sign" size={12} color={colors.accent} />
            <Text style={[styles.pillText, { color: colors.accent }]}>
              {player.gold.toLocaleString()}
            </Text>
          </View>
          {pendingCount > 0 && (
            <TouchableOpacity
              style={[styles.pill, { backgroundColor: '#C0392B' }]}
              onPress={() => setShowOrdersModal(true)}
              activeOpacity={0.8}
            >
              <Feather name="inbox" size={12} color="#fff" />
              <Text style={[styles.pillText, { color: '#fff' }]}>{pendingCount}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.pill, { backgroundColor: colors.secondary }]}
            onPress={() => setShowUpgradesModal(true)}
            activeOpacity={0.8}
          >
            <Feather name="settings" size={12} color={upgradeLevel > 0 ? colors.accent : colors.mutedForeground} />
            {upgradeLevel > 0 && (
              <Text style={[styles.pillText, { color: colors.accent }]}>+{upgradeLevel}</Text>
            )}
          </TouchableOpacity>
          <View style={[styles.pill, { backgroundColor: colors.primary }]}>
            <Text style={[styles.pillText, { color: colors.primaryForeground }]}>
              Niv.{player.level}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── 3D Scene ── */}
      <View style={styles.sceneContainer}>
        <ForgeScene3D ref={sceneRef} craftPhase={craftPhase} upgradeLevel={upgradeLevel} />
        <WeatherEffect type={weather} />

        {/* Heating overlay */}
        {craftPhase === 'HEATING' && (
          <View style={styles.phaseOverlay} pointerEvents="none">
            <LinearGradient
              colors={['transparent', 'rgba(10,8,16,0.85)']}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.heatingContent}>
              <Text style={[styles.phaseTitle, { color: colors.accent }]}>
                🔥 Chauffe le métal…
              </Text>
              {selectedRecipe && (
                <Text style={[styles.recipeNameSmall, { color: colors.mutedForeground }]}>
                  {selectedRecipe.name}
                </Text>
              )}
              <View style={[styles.heatingTrack, { backgroundColor: colors.muted }]}>
                <View
                  style={[
                    styles.heatingFill,
                    {
                      width: `${heatingProgress * 100}%` as `${number}%`,
                      backgroundColor: colors.primary,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.heatingPct, { color: colors.primary }]}>
                {Math.round(heatingProgress * 100)}%
              </Text>
            </View>
          </View>
        )}

        {/* Cooling overlay */}
        {craftPhase === 'COOLING' && (
          <View style={styles.phaseOverlay} pointerEvents="none">
            <LinearGradient
              colors={['transparent', 'rgba(10,8,16,0.85)']}
              style={StyleSheet.absoluteFillObject}
            />
            <View style={styles.heatingContent}>
              <Text style={[styles.phaseTitle, { color: '#48A0D0' }]}>
                💧 Refroidissement…
              </Text>
            </View>
          </View>
        )}

        {/* Hit label flash */}
        {lastHitLabel && (
          <View style={styles.hitFlash} pointerEvents="none">
            <Text
              style={[
                styles.hitFlashText,
                { color: lastHitLabel === 'PARFAIT!' ? '#9966CC' : lastHitLabel === 'RATÉ' ? colors.destructive : colors.accent },
              ]}
            >
              {lastHitLabel}
            </Text>
          </View>
        )}
      </View>

      {/* ── Bottom Panel ── */}
      <View
        style={[
          styles.bottomPanel,
          { backgroundColor: colors.card, borderTopColor: colors.border },
        ]}
      >
        {craftPhase === 'IDLE' && (
          <IdlePanel
            player={player}
            forgeSkillLevel={forgeSkillLevel}
            forgeXPPct={forgeXPPct}
            xpPct={xpPct}
            availableCount={availableRecipes.length}
            colors={colors}
            bottomPad={bottomPad}
            onStartCraft={() => setShowRecipeSheet(true)}
            game={game}
          />
        )}

        {craftPhase === 'HAMMERING' && (
          <View style={{ paddingBottom: bottomPad }}>
            {showEventBanner && activeForgeEvent && (
              <View style={[styles.eventBanner, { borderColor: activeForgeEvent.color + '80', backgroundColor: activeForgeEvent.color + '18' }]}>
                <Text style={styles.eventEmoji}>{activeForgeEvent.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventName, { color: activeForgeEvent.color }]}>{activeForgeEvent.name}</Text>
                  <Text style={[styles.eventDesc, { color: colors.mutedForeground }]}>{activeForgeEvent.description}</Text>
                </View>
              </View>
            )}
            <HammeringMiniGame
              strikesCompleted={session.strikesCompleted}
              strikeScores={session.strikeScores}
              onStrike={handleStrike}
              forgeSkillLevel={forgeSkillLevel}
            />
          </View>
        )}

        {(craftPhase === 'HEATING' || craftPhase === 'COOLING') && (
          <View style={[styles.inProgressPanel, { paddingBottom: bottomPad + 16 }]}>
            <Feather
              name={craftPhase === 'HEATING' ? 'thermometer' : 'droplet'}
              size={22}
              color={craftPhase === 'HEATING' ? colors.primary : '#48A0D0'}
            />
            <Text style={[styles.inProgressText, { color: colors.mutedForeground }]}>
              {craftPhase === 'HEATING'
                ? 'Le métal chauffe dans le four…'
                : 'Trempe dans l\'eau…'}
            </Text>
          </View>
        )}
      </View>

      {/* ── Recipe Sheet ── */}
      <Modal visible={showRecipeSheet} transparent animationType="slide" statusBarTranslucent>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.sheetHandle, { backgroundColor: colors.muted }]} />
            <View style={styles.sheetTitleRow}>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                Choisir une recette
              </Text>
              <TouchableOpacity onPress={() => setShowRecipeSheet(false)}>
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {availableRecipes.length === 0 ? (
              <View style={styles.sheetEmpty}>
                <Feather name="tool" size={32} color={colors.mutedForeground} />
                <Text style={[styles.sheetEmptyText, { color: colors.mutedForeground }]}>
                  Améliorez votre compétence Forge pour débloquer des recettes
                </Text>
              </View>
            ) : (
              <FlatList
                data={availableRecipes}
                keyExtractor={(r) => r.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: bottomPad }}
                renderItem={({ item: recipe }) => {
                  const canCraft = game.canCraftRecipe(recipe.id);
                  return (
                    <TouchableOpacity
                      style={[
                        styles.recipeRow,
                        {
                          backgroundColor: colors.secondary,
                          borderColor: canCraft ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => startCraft(recipe)}
                      disabled={!canCraft}
                      activeOpacity={0.75}
                    >
                      <View style={styles.recipeRowLeft}>
                        <Text
                          style={[
                            styles.recipeCategory,
                            { color: colors.primary },
                          ]}
                        >
                          {recipe.category.toUpperCase()}
                        </Text>
                        <Text style={[styles.recipeName, { color: canCraft ? colors.foreground : colors.mutedForeground }]}>
                          {recipe.name}
                        </Text>
                        <View style={styles.matList}>
                          {recipe.requirements.map((req) => {
                            const res = game.getResourceById(req.resourceId);
                            const have = game.getInventoryQty(req.resourceId);
                            const ok = have >= req.quantity;
                            return (
                              <Text
                                key={req.resourceId}
                                style={[
                                  styles.matChip,
                                  { color: ok ? colors.accent : colors.destructive },
                                ]}
                              >
                                {have}/{req.quantity} {res?.name ?? req.resourceId}
                              </Text>
                            );
                          })}
                        </View>
                      </View>
                      <View style={styles.recipeRowRight}>
                        <Text style={[styles.recipeXP, { color: colors.accent }]}>
                          +{recipe.xpReward} XP
                        </Text>
                        {canCraft ? (
                          <View style={[styles.forgeBadge, { backgroundColor: colors.primary }]}>
                            <Text style={[styles.forgeBadgeText, { color: colors.primaryForeground }]}>
                              FORGER
                            </Text>
                          </View>
                        ) : (
                          <Feather name="lock" size={18} color={colors.mutedForeground} />
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── Orders Modal ── */}
      <OrdersModal
        visible={showOrdersModal}
        onClose={() => setShowOrdersModal(false)}
        game={game}
        colors={colors}
        bottomPad={bottomPad}
        deliverOrderId={deliverOrderId}
        setDeliverOrderId={setDeliverOrderId}
      />

      {/* ── Forge Upgrades Modal ── */}
      <ForgeUpgradesModal
        visible={showUpgradesModal}
        onClose={() => setShowUpgradesModal(false)}
        game={game}
        colors={colors}
        bottomPad={bottomPad}
      />

      {/* ── Craft Result Modal ── */}
      <Modal visible={craftPhase === 'RESULT' && !!craftedItem} transparent animationType="fade" statusBarTranslucent>
        {craftedItem && (
          <View style={styles.resultOverlay}>
            <View
              style={[
                styles.resultBox,
                {
                  backgroundColor: colors.card,
                  borderColor: qualityColor(craftedItem.quality, colors),
                },
              ]}
            >
              {/* Quality glow bar */}
              <View
                style={[
                  styles.resultQualityBar,
                  { backgroundColor: qualityColor(craftedItem.quality, colors) },
                ]}
              />
              <Text
                style={[
                  styles.resultQualityLabel,
                  { color: qualityColor(craftedItem.quality, colors) },
                ]}
              >
                {qualityLabel(craftedItem.quality)}
              </Text>
              <Text style={[styles.resultItemName, { color: colors.foreground }]}>
                {craftedItem.name}
              </Text>
              <Text style={[styles.resultScore, { color: colors.mutedForeground }]}>
                Score de qualité: {craftedItem.qualityScore}/100
              </Text>

              {/* Active forge event */}
              {activeForgeEvent && (
                <View style={[styles.resultEventRow, { backgroundColor: activeForgeEvent.color + '22', borderColor: activeForgeEvent.color + '66' }]}>
                  <Text style={{ fontSize: 16 }}>{activeForgeEvent.emoji}</Text>
                  <Text style={[styles.resultEventText, { color: activeForgeEvent.color }]}>
                    {activeForgeEvent.name} — {activeForgeEvent.description}
                  </Text>
                </View>
              )}

              {/* Mini-game breakdown */}
              <View style={[styles.resultBreakdown, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.breakdownTitle, { color: colors.mutedForeground }]}>
                  MARTELAGE
                </Text>
                <View style={styles.breakdownRow}>
                  {session.strikeScores.map((s, i) => (
                    <View
                      key={i}
                      style={[
                        styles.breakdownDot,
                        {
                          backgroundColor:
                            s >= 20 ? '#9966CC' : s >= 14 ? colors.accent : s >= 7 ? colors.primary : colors.destructive,
                        },
                      ]}
                    />
                  ))}
                  <Text style={[styles.breakdownScore, { color: colors.accent }]}>
                    {session.strikeScores.reduce((a, b) => a + b, 0)}/
                    {session.strikesCompleted * 25} pts
                  </Text>
                </View>
              </View>

              {/* Stats */}
              <View style={styles.resultStats}>
                {craftedItem.stats.attack !== undefined && (
                  <View style={[styles.statChip, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>ATQ</Text>
                    <Text style={[styles.statValue, { color: colors.accent }]}>+{craftedItem.stats.attack}</Text>
                  </View>
                )}
                {craftedItem.stats.defense !== undefined && (
                  <View style={[styles.statChip, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>DEF</Text>
                    <Text style={[styles.statValue, { color: colors.accent }]}>+{craftedItem.stats.defense}</Text>
                  </View>
                )}
                {craftedItem.stats.magic !== undefined && (
                  <View style={[styles.statChip, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>MAG</Text>
                    <Text style={[styles.statValue, { color: colors.accent }]}>+{craftedItem.stats.magic}</Text>
                  </View>
                )}
                {craftedItem.stats.speed !== undefined && (
                  <View style={[styles.statChip, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>VIT</Text>
                    <Text style={[styles.statValue, { color: colors.accent }]}>+{craftedItem.stats.speed}</Text>
                  </View>
                )}
              </View>

              <Text style={[styles.resultValue, { color: colors.primary }]}>
                Valeur: {craftedItem.value} pièces d'or
              </Text>
              <Text style={[styles.resultXP, { color: colors.accent }]}>
                +{selectedRecipe?.xpReward ?? 0} XP Forge  ·  +{selectedRecipe?.xpReward ?? 0} XP Joueur
              </Text>

              {/* Forgeron attribution */}
              <View style={[styles.resultAttribution, { backgroundColor: colors.secondary }]}>
                <AvatarCircle color={player.avatarColor} icon={player.avatarIcon} name={player.name} size={24} />
                <Text style={[styles.resultAttributionText, { color: colors.mutedForeground }]}>
                  Forgé par <Text style={{ color: colors.foreground, fontWeight: '700' }}>{player.name}</Text>
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.collectBtn, { backgroundColor: qualityColor(craftedItem.quality, colors) }]}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  resetCraft();
                }}
              >
                <Feather name="package" size={16} color="#fff" />
                <Text style={styles.collectBtnText}>Ajouter à l'inventaire</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

// ─── Apprentice Card ─────────────────────────────────────────────────────────
function ApprenticeCard({
  game,
  colors,
}: {
  game: ReturnType<typeof useGame>;
  colors: ReturnType<typeof useColors>;
}) {
  const ap = game.apprentice;
  const [msg, setMsg] = React.useState<string | null>(null);
  const [pickingRecipe, setPickingRecipe] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());

  // Tick every 5 s to update the progress bar
  React.useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const showMsg = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2500); };

  const HIRE_COST = 500;
  const hireCost = HIRE_COST;

  if (!ap) {
    return (
      <View style={[apStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[apStyles.title, { color: colors.foreground }]}>🔨 Apprenti Forgeron</Text>
        <Text style={[apStyles.sub, { color: colors.mutedForeground }]}>
          Recrutez un apprenti pour qu'il forge des objets pendant que vous vous occupez des commandes.
        </Text>
        <TouchableOpacity
          style={[apStyles.btn, { backgroundColor: colors.primary }]}
          onPress={() => {
            const ok = game.hireApprentice();
            if (!ok) showMsg('Or insuffisant.');
          }}
          activeOpacity={0.8}
        >
          <Text style={[apStyles.btnText, { color: colors.primaryForeground }]}>
            Recruter — {hireCost}g
          </Text>
        </TouchableOpacity>
        {msg && <Text style={[apStyles.msg, { color: '#E57373' }]}>{msg}</Text>}
      </View>
    );
  }

  // Progress bar when crafting
  const isCrafting = !!ap.craftStartedAt && !ap.readyItem;
  const isReady    = !!ap.readyItem;
  const craftPct   = isCrafting && ap.craftDurationMs > 0
    ? Math.min(1, (now - (ap.craftStartedAt ?? 0)) / ap.craftDurationMs)
    : 0;
  const remaining  = isCrafting
    ? Math.max(0, Math.round(((ap.craftStartedAt ?? 0) + ap.craftDurationMs - now) / 1000))
    : 0;

  const assignedRecipe = ap.assignedRecipeId
    ? game.allRecipes.find((r) => r.id === ap.assignedRecipeId)
    : null;

  const xpPct = Math.min(100, Math.round((ap.xp / ap.xpToNextLevel) * 100));
  const trainCost = ap.level < 10
    ? Math.round(300 * Math.pow(1.8, ap.level - 1))
    : null;

  const availableForApprenticeship = game.allRecipes.filter(
    (r) => r.levelRequired <= Math.max(1, ap.level * 4),
  );

  return (
    <View style={[apStyles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Header */}
      <View style={apStyles.row}>
        <Text style={[apStyles.title, { color: colors.foreground }]}>
          🔨 {ap.name}
        </Text>
        <View style={[apStyles.badge, { backgroundColor: colors.secondary }]}>
          <Text style={[apStyles.badgeText, { color: colors.accent }]}>Niv. {ap.level}</Text>
        </View>
      </View>

      {/* XP bar */}
      <View style={[apStyles.track, { backgroundColor: colors.muted }]}>
        <View style={[apStyles.fill, { width: `${xpPct}%` as `${number}%`, backgroundColor: colors.accent }]} />
      </View>
      <Text style={[apStyles.xpLabel, { color: colors.mutedForeground }]}>
        XP {ap.xp}/{ap.xpToNextLevel}
      </Text>

      {/* Craft status */}
      {isReady && ap.readyItem && (
        <TouchableOpacity
          style={[apStyles.readyRow, { backgroundColor: '#1B5E2088' }]}
          onPress={() => {
            const result = game.collectApprenticeItem();
            if (result.success && result.item) {
              showMsg(`${result.item.name} (${result.item.quality}) récupéré !`);
              AudioManager.playCollect();
            } else {
              showMsg(result.message ?? 'Erreur.');
            }
          }}
          activeOpacity={0.8}
        >
          <View style={{ alignItems: 'center', gap: 2 }}>
            <Text style={{ color: '#A5D6A7', fontWeight: '700' }}>
              ✓ {ap.readyItem.name} ({ap.readyItem.quality}) prêt
            </Text>
            <Text style={{ color: '#A5D6A7', fontSize: 11, opacity: 0.85 }}>
              Salaire : {25 * ap.level}g — Appuyer pour payer et récupérer
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {isCrafting && assignedRecipe && (
        <View>
          <Text style={[apStyles.craftLabel, { color: colors.mutedForeground }]}>
            Forge : {assignedRecipe.name}  ({remaining}s restant)
          </Text>
          <View style={[apStyles.track, { backgroundColor: colors.muted }]}>
            <View style={[apStyles.fill, { width: `${Math.round(craftPct * 100)}%` as `${number}%`, backgroundColor: colors.primary }]} />
          </View>
        </View>
      )}

      {!isCrafting && !isReady && (
        <Text style={[apStyles.craftLabel, { color: colors.mutedForeground }]}>
          {ap.assignedRecipeId ? 'En attente de recette…' : 'Aucune recette assignée.'}
        </Text>
      )}

      {msg && <Text style={[apStyles.msg, { color: '#A5D6A7' }]}>{msg}</Text>}

      {/* Action buttons */}
      <View style={apStyles.row}>
        <TouchableOpacity
          style={[apStyles.btnSm, { backgroundColor: colors.secondary, borderColor: colors.border, flex: 1 }]}
          onPress={() => setPickingRecipe(true)}
          activeOpacity={0.8}
        >
          <Text style={[apStyles.btnSmText, { color: colors.foreground }]}>📋 Recette</Text>
        </TouchableOpacity>
        {trainCost !== null && (
          <TouchableOpacity
            style={[apStyles.btnSm, { backgroundColor: colors.secondary, borderColor: colors.accent + '80', flex: 1 }]}
            onPress={() => {
              const r = game.trainApprentice();
              showMsg(r.message);
              if (r.success) AudioManager.playTalentUnlock();
            }}
            activeOpacity={0.8}
          >
            <Text style={[apStyles.btnSmText, { color: colors.accent }]}>⬆ Former ({trainCost}g)</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Recipe picker */}
      {pickingRecipe && (
        <View style={[apStyles.pickerBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Text style={[apStyles.pickerTitle, { color: colors.mutedForeground }]}>Choisir une recette :</Text>
          {availableForApprenticeship.map((r) => (
            <TouchableOpacity
              key={r.id}
              style={[apStyles.pickerRow, { borderBottomColor: colors.border }]}
              onPress={() => {
                game.assignApprenticeRecipe(r.id);
                setPickingRecipe(false);
                showMsg(`${ap.name} forge maintenant : ${r.name}`);
              }}
              activeOpacity={0.8}
            >
              <Text style={[apStyles.pickerName, { color: colors.foreground }]}>{r.name}</Text>
              <Text style={[apStyles.pickerMeta, { color: colors.mutedForeground }]}>Niv.{r.levelRequired}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const apStyles = StyleSheet.create({
  card:        { borderWidth: 1, borderRadius: 14, padding: 14, marginHorizontal: 16, marginTop: 14, gap: 8 },
  title:       { fontSize: 15, fontWeight: '700' },
  sub:         { fontSize: 12, lineHeight: 18 },
  row:         { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  badgeText:   { fontSize: 12, fontWeight: '700' },
  track:       { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill:        { height: '100%', borderRadius: 3 },
  xpLabel:     { fontSize: 10 },
  craftLabel:  { fontSize: 12 },
  readyRow:    { borderRadius: 10, padding: 10, alignItems: 'center' },
  msg:         { fontSize: 12, fontWeight: '600', textAlign: 'center' },
  btn:         { borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnText:     { fontWeight: '700', fontSize: 14 },
  btnSm:       { borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', gap: 4 },
  btnSmText:   { fontSize: 12, fontWeight: '600' },
  pickerBox:   { borderWidth: 1, borderRadius: 10, marginTop: 4, maxHeight: 200, overflow: 'hidden' },
  pickerTitle: { fontSize: 11, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 },
  pickerRow:   { borderBottomWidth: StyleSheet.hairlineWidth, paddingHorizontal: 10, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between' },
  pickerName:  { fontSize: 13 },
  pickerMeta:  { fontSize: 11 },
});

// ─── Idle Panel ──────────────────────────────────────────────────────────────
function IdlePanel({
  player,
  forgeSkillLevel,
  forgeXPPct,
  xpPct,
  availableCount,
  colors,
  bottomPad,
  onStartCraft,
  game,
}: {
  player: ReturnType<typeof useGame>['player'];
  forgeSkillLevel: number;
  forgeXPPct: number;
  xpPct: number;
  availableCount: number;
  colors: ReturnType<typeof useColors>;
  bottomPad: number;
  onStartCraft: () => void;
  game: ReturnType<typeof useGame>;
}) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.idlePanel, { paddingBottom: bottomPad + 8 }]}
      keyboardShouldPersistTaps="handled"
    >
      {/* Forge stats */}
      <View style={styles.forgeStats}>
        <View style={styles.forgeStat}>
          <Text style={[styles.forgeStatLabel, { color: colors.mutedForeground }]}>
            FORGE
          </Text>
          <Text style={[styles.forgeStatValue, { color: colors.accent }]}>
            Niv.{forgeSkillLevel}
          </Text>
          <View style={[styles.miniTrack, { backgroundColor: colors.muted }]}>
            <View
              style={[
                styles.miniFill,
                { width: `${forgeXPPct}%` as `${number}%`, backgroundColor: colors.primary },
              ]}
            />
          </View>
        </View>
        <View style={styles.forgeStat}>
          <Text style={[styles.forgeStatLabel, { color: colors.mutedForeground }]}>
            JOUEUR
          </Text>
          <Text style={[styles.forgeStatValue, { color: colors.foreground }]}>
            Niv.{player.level}
          </Text>
          <View style={[styles.miniTrack, { backgroundColor: colors.muted }]}>
            <View
              style={[
                styles.miniFill,
                { width: `${xpPct}%` as `${number}%`, backgroundColor: colors.accent },
              ]}
            />
          </View>
        </View>
        <View style={styles.forgeStat}>
          <Text style={[styles.forgeStatLabel, { color: colors.mutedForeground }]}>FORGÉS</Text>
          <Text style={[styles.forgeStatValue, { color: colors.foreground }]}>
            {player.totalItemsCrafted}
          </Text>
          <View style={[styles.miniTrack, { backgroundColor: 'transparent' }]} />
        </View>
      </View>

      {/* Start button */}
      <TouchableOpacity
        style={[styles.startCraftBtn, { backgroundColor: colors.primary }]}
        onPress={onStartCraft}
        activeOpacity={0.8}
      >
        <Feather name="tool" size={18} color={colors.primaryForeground} />
        <Text style={[styles.startCraftText, { color: colors.primaryForeground }]}>
          FORGER  ·  {availableCount} recettes
        </Text>
      </TouchableOpacity>

      {/* Apprentice card — inlined so it scrolls with the panel */}
      <ApprenticeCard game={game} colors={colors} />
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerTitle: { fontSize: 17, fontWeight: '800', letterSpacing: 3 },
  headerForgeName: { fontSize: 11, fontWeight: '500', letterSpacing: 1, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  pill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, gap: 3 },
  pillText: { fontSize: 13, fontWeight: '700' },

  // 3D scene
  sceneContainer: { flex: 1, overflow: 'hidden' },

  // Phase overlays (on top of scene)
  phaseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
  },
  heatingContent: {
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingBottom: 20,
    gap: 8,
  },
  phaseTitle: { fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  recipeNameSmall: { fontSize: 13 },
  heatingTrack: { width: '100%', height: 8, borderRadius: 4, overflow: 'hidden' },
  heatingFill: { height: '100%', borderRadius: 4, minWidth: 4 },
  heatingPct: { fontSize: 14, fontWeight: '700' },

  hitFlash: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  hitFlashText: { fontSize: 32, fontWeight: '900', letterSpacing: 3 },

  // Bottom panel
  bottomPanel: {
    borderTopWidth: 1,
  },
  inProgressPanel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  inProgressText: { fontSize: 14 },

  // Idle panel
  idlePanel: { paddingHorizontal: 20, paddingTop: 14 },
  forgeStats: { flexDirection: 'row', gap: 16, marginBottom: 14 },
  forgeStat: { flex: 1 },
  forgeStatLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 3 },
  forgeStatValue: { fontSize: 17, fontWeight: '800', marginBottom: 4 },
  miniTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  miniFill: { height: '100%', borderRadius: 2, minWidth: 3 },
  eventBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  eventEmoji: { fontSize: 22 },
  eventName: { fontSize: 13, fontWeight: '800' },
  eventDesc: { fontSize: 11, marginTop: 1 },
  resultEventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginTop: 6,
  },
  resultEventText: { flex: 1, fontSize: 12, fontWeight: '600' },
  startCraftBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 14,
    gap: 10,
  },
  startCraftText: { fontSize: 16, fontWeight: '800', letterSpacing: 2 },

  // Recipe sheet
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  sheet: {
    maxHeight: '80%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 18 },
  sheetTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 20, fontWeight: '700' },
  sheetEmpty: { alignItems: 'center', paddingVertical: 40, gap: 12 },
  sheetEmptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  recipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  recipeRowLeft: { flex: 1 },
  recipeCategory: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  recipeName: { fontSize: 15, fontWeight: '600', marginBottom: 5 },
  matList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  matChip: { fontSize: 11 },
  recipeRowRight: { alignItems: 'flex-end', gap: 8, paddingLeft: 12 },
  recipeXP: { fontSize: 12, fontWeight: '600' },
  forgeBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  forgeBadgeText: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },

  // Result modal
  resultOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', padding: 20 },
  resultBox: { borderRadius: 20, borderWidth: 2, padding: 24, overflow: 'hidden' },
  resultQualityBar: { height: 4, borderRadius: 2, marginBottom: 14 },
  resultQualityLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 3, marginBottom: 6 },
  resultItemName: { fontSize: 28, fontWeight: '900', marginBottom: 4 },
  resultScore: { fontSize: 13, marginBottom: 16 },
  resultBreakdown: { borderRadius: 10, padding: 12, marginBottom: 16 },
  breakdownTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, marginBottom: 8 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownDot: { width: 16, height: 16, borderRadius: 8 },
  breakdownScore: { fontSize: 14, fontWeight: '700', marginLeft: 'auto' },
  resultStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, alignItems: 'center', minWidth: 64 },
  statLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  statValue: { fontSize: 18, fontWeight: '800' },
  resultValue: { fontSize: 16, fontWeight: '700', marginBottom: 4 },
  resultXP: { fontSize: 13, marginBottom: 20 },
  resultAttribution: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  resultAttributionText: { fontSize: 12 },
  collectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 10,
  },
  collectBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
