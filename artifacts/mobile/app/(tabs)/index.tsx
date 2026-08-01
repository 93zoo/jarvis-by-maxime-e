import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Easing,
  FlatList,
  Image,
  ImageBackground,
  Modal,
  Platform,
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
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useGame } from '@/context/GameContext';
import { useColors } from '@/hooks/useColors';
import type { Item, Quality, RecipeData } from '@/types/game';
import ForgeScene3D, { CraftPhase, ForgeScene3DRef } from '@/components/ForgeScene3D';
import ForgeBackdrop from '@/components/ForgeBackdrop';
import BoutiqueButton from '@/components/BoutiqueButton';
import NeonIconButton from '@/components/NeonIconButton';
import { useRewardedAds } from '@/lib/rewardedAds';
import HammeringMiniGame, { HitLabel } from '@/components/HammeringMiniGame';
import WeatherEffect, { WeatherType } from '@/components/WeatherEffect';
import AudioManager from '@/utils/AudioManager';
import { applyStoredAudioSettings } from '@/utils/audioSettings';
import CraftingEnigmaModal from '@/components/CraftingEnigma';

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

// Photorealistic forge backdrop (generated asset)
const FORGE_BG = require('../../assets/images/forge-bg-v2.png');

// ─── Medieval UI palette (leather / brushed steel / ember) ───────────────────
const MEDIEVAL = {
  ember: '#FF7A1A',
  emberSoft: '#E8862A',
  oldGold: '#C9A227',
  steelDark: '#1A1410',
  panel: 'rgba(12,9,6,0.78)',
  panelLight: 'rgba(24,18,12,0.85)',
  border: 'rgba(200,140,60,0.38)',
  borderBright: 'rgba(255,150,50,0.65)',
  textLight: '#F5E7CE',
  textDim: '#A8927A',
};

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
  urgentBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  urgentBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, gap: 4 },
  urgentBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  urgentTimer: { fontSize: 14, fontWeight: '800', letterSpacing: 1, fontVariant: ['tabular-nums'] as const },
  urgentBonusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  urgentBonusChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, gap: 3 },
  urgentBonusText: { fontSize: 11, fontWeight: '700' },
  urgentHeaderBadge: {
    position: 'absolute', top: -5, right: -7,
    minWidth: 16, height: 16, borderRadius: 8,
    backgroundColor: '#FF3D00', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  urgentHeaderBadgeText: { fontSize: 9, fontWeight: '800', color: '#fff' },
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
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [visible]);

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

  const deadlineLabel = (deadline: number, urgent?: boolean) => {
    const diff = deadline - nowTick;
    if (diff <= 0) return urgent ? '00:00' : 'Expiré';
    if (urgent) {
      const m = Math.floor(diff / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
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
                const expired = order.deadline < nowTick;
                const urgentTimerDone = order.isUrgent && expired;
                const urgentBorderColor = order.isUrgent ? (expired ? '#B71C1C' : '#FF6D00') : order.accepted ? colors.primary : colors.border;
                return (
                  <View style={[oStyles.orderCard, { backgroundColor: colors.secondary, borderColor: urgentBorderColor, borderWidth: order.isUrgent ? 2 : 1 }]}>
                    <View style={oStyles.orderCardTop}>
                      <Text style={{ fontSize: 24 }}>{order.npcEmoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[oStyles.orderNPC, { color: colors.foreground }]}>{order.npcName}</Text>
                        <Text style={[oStyles.orderType, { color: colors.mutedForeground }]}>
                          {order.npcType}
                          {!order.isUrgent && ` · ${deadlineLabel(order.deadline)}`}
                          {!order.isUrgent && expired && <Text style={{ color: '#F44336' }}> EXPIRÉ</Text>}
                        </Text>
                      </View>
                      <View style={[oStyles.rewardBadge, { backgroundColor: colors.card }]}>
                        <Text style={[oStyles.rewardText, { color: colors.accent }]}>{order.goldReward}g</Text>
                      </View>
                    </View>

                    {/* Urgent badge + live countdown */}
                    {order.isUrgent && (
                      <View style={oStyles.urgentBadgeRow}>
                        <View style={[oStyles.urgentBadge, { backgroundColor: urgentTimerDone ? '#B71C1C22' : '#FF6D0022' }]}>
                          <Text style={{ fontSize: 12 }}>⚡</Text>
                          <Text style={[oStyles.urgentBadgeText, { color: urgentTimerDone ? '#FF5252' : '#FF6D00' }]}>
                            {urgentTimerDone ? 'EXPIRÉ' : 'URGENT'}
                          </Text>
                        </View>
                        {!urgentTimerDone && (
                          <Text style={[oStyles.urgentTimer, { color: nowTick > order.deadline - 5 * 60_000 ? '#FF3D00' : '#FF8F00' }]}>
                            {deadlineLabel(order.deadline, true)}
                          </Text>
                        )}
                      </View>
                    )}

                    <Text style={[oStyles.orderRequest, { color: colors.foreground }]}>Commande : {order.requestedName}</Text>
                    <Text style={[oStyles.orderMeta, { color: colors.mutedForeground }]}>
                      {order.requestedCategory} · +{order.xpReward} XP
                    </Text>

                    {/* Urgent bonus preview */}
                    {order.isUrgent && !urgentTimerDone && (
                      <View style={oStyles.urgentBonusRow}>
                        <Text style={[oStyles.urgentBonusText, { color: colors.mutedForeground }]}>Si livré à temps :</Text>
                        <View style={[oStyles.urgentBonusChip, { backgroundColor: '#FF6D0020' }]}>
                          <Text style={{ fontSize: 11 }}>⚡</Text>
                          <Text style={[oStyles.urgentBonusText, { color: '#FF8F00' }]}>+{order.urgentBonusGold ?? 0}g</Text>
                        </View>
                        <View style={[oStyles.urgentBonusChip, { backgroundColor: '#1565C020' }]}>
                          <Text style={{ fontSize: 11 }}>✨</Text>
                          <Text style={[oStyles.urgentBonusText, { color: '#1E88E5' }]}>+{order.urgentBonusXp ?? 0} XP</Text>
                        </View>
                      </View>
                    )}
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

// ─── Rail button (left sidebar) — defined BEFORE ForgeScreen (Hermes rule) ──
function RailButton({
  icon,
  label,
  badge,
  onPress,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={md.railBtn} onPress={onPress} activeOpacity={0.8}>
      <View style={md.railBtnCircle}>
        <Feather name={icon} size={18} color={MEDIEVAL.textLight} />
        {badge !== undefined && badge > 0 && (
          <View style={md.badge}>
            <Text style={md.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={md.railBtnLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function ForgeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const game = useGame();
  const router = useRouter();
  const { adsUnlocked, showRewardedAd } = useRewardedAds();
  const [rewardDoubled, setRewardDoubled] = useState(false);
  const [adBusy, setAdBusy] = useState(false);

  const [craftPhase, setCraftPhase] = useState<CraftPhase>('IDLE');
  const [session, setSession] = useState<CraftSession>(EMPTY_SESSION);
  const [heatingProgress, setHeatingProgress] = useState(0);
  const [craftedItem, setCraftedItem] = useState<Item | null>(null);
  const [showRecipeSheet, setShowRecipeSheet] = useState(false);
  const [lastHitLabel, setLastHitLabel] = useState<HitLabel | null>(null);
  const [showOrdersModal, setShowOrdersModal] = useState(false);
  const [deliverOrderId, setDeliverOrderId] = useState<string | null>(null);
  const [showUpgradesModal, setShowUpgradesModal] = useState(false);
  const [showApprenticeModal, setShowApprenticeModal] = useState(false);
  const [weather, setWeather] = useState<WeatherType>('none');
  const [activeForgeEvent, setActiveForgeEvent] = useState<ForgeEvent | null>(null);
  const [showEventBanner, setShowEventBanner] = useState(false);
  // ── Temperature gauge ──
  const [temperature, setTemperature] = useState(0);   // 0-100+
  const [overheated, setOverheated] = useState(false); // flash state

  const sceneRef = useRef<ForgeScene3DRef>(null);
  const forgePressRef = useRef(new Animated.Value(1));
  const forgeFloatRef = useRef(new Animated.Value(0));
  const hitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const temperatureRef = useRef(0); // readable inside callbacks without stale closure
  // ── Quench gauge ──
  const [quenchProgress, setQuenchProgress] = useState(100); // 100=hot → 0=cold
  const [quenchTapped, setQuenchTapped] = useState(false);
  const [quenchLabel, setQuenchLabel] = useState<string | null>(null);
  const quenchProgressRef = useRef(100);
  const quenchDoneRef = useRef(false);
  const runResultRef = useRef<((mod: number) => void) | null>(null);
  const activeRecipeRef = useRef<RecipeData | null>(null);
  const [pendingEnigma, setPendingEnigma] = useState<{ recipeId: string; qualityScore: number } | null>(null);

  const { height: winH } = useWindowDimensions();
  const headerTopPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 80;

  // Press feedback: slight shrink + bounce on the FORGER artwork button
  const onForgePressIn = () => {
    Animated.spring(forgePressRef.current, {
      toValue: 0.88,
      useNativeDriver: true,
      speed: 40,
      bounciness: 0,
    }).start();
  };
  const onForgePressOut = () => {
    Animated.spring(forgePressRef.current, {
      toValue: 1,
      useNativeDriver: true,
      speed: 16,
      bounciness: 12,
    }).start();
  };

  // Gentle floating-in-place bob for the FORGER artwork button
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(forgeFloatRef.current, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(forgeFloatRef.current, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);
  const forgeFloatY = forgeFloatRef.current.interpolate({
    inputRange: [0, 1],
    outputRange: [5, -5],
  });

  // Init audio on mount + weather cycle + forge ambience
  useEffect(() => {
    AudioManager.init();
    // Restore saved mute/volume BEFORE starting any loop so a muted player
    // never hears a burst on app open.
    applyStoredAudioSettings().finally(() => {
      // Start the looping fire-crackle ambience when the forge tab is entered
      AudioManager.startForgeAmbience();
      // Medieval music bed + layered environmental loops (fire crackle, bellows)
      AudioManager.startMusic();
      AudioManager.startAmbienceLayers();
    });

    return () => {
      // Stop every loop started above so nothing outlives the forge screen
      AudioManager.stopMusic();
      AudioManager.stopAmbienceLayers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Web: page-visibility suspend/resume lives in its own effect below.
  useEffect(() => {

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

    // Native: reinitialize players and restore loops when the app returns from background.
    // handleForeground() reloads all expo-audio players (which can silently break after
    // an OS audio-session interruption) and restarts music/ambience that was live before.
    // handleBackground() snapshots playback state then stops everything cleanly.
    // (On web AppState doesn't fire for tab switches — visibilitychange handles that above.)
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (Platform.OS !== 'web') {
        if (nextState === 'active') {
          AudioManager.handleForeground();
        } else if (nextState === 'background' || nextState === 'inactive') {
          AudioManager.handleBackground();
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

    // Furnace upgrade: -15% heating time per level (min 25% of base)
    const furnaceLevel = game.forgeUpgrades['furnace'] ?? 0;
    const heatingMs = Math.round(3200 * Math.max(0.25, 1 - furnaceLevel * 0.15));

    const interval = setInterval(() => {
      const elapsed = (Date.now() - start) / heatingMs;
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
    if (craftPhase !== 'COOLING') {
      setQuenchProgress(100);
      setQuenchTapped(false);
      setQuenchLabel(null);
      quenchProgressRef.current = 100;
      quenchDoneRef.current = false;
      runResultRef.current = null;
      return;
    }

    quenchProgressRef.current = 100;
    quenchDoneRef.current = false;
    setQuenchProgress(100);
    setQuenchTapped(false);
    setQuenchLabel(null);

    // ── Inner result-calculation function ──────────────────────────────────
    // Captures session/game/activeForgeEvent from closure (stable during COOLING)
    const runResult = (quenchMod: number) => {
      if (quenchDoneRef.current) return;
      quenchDoneRef.current = true;
      clearInterval(intervalId); // intervalId captured by ref-close below

      setTimeout(() => {
        const { strikeScores, strikesCompleted, recipeId } = session;
        const totalStrikeScore = strikeScores.reduce((a, b) => a + b, 0);
        const maxScore = strikesCompleted * 25;
        const anvilLevel    = game.forgeUpgrades['anvil']        ?? 0;
        const forgeUpgLevel = game.forgeUpgrades['forge']        ?? 0;
        const quickQuenchLv = game.forgeUpgrades['quick_quench'] ?? 0;
        const masterGripLv  = game.forgeUpgrades['master_grip']  ?? 0;
        const anvilMult     = 1 + anvilLevel * 0.12 + masterGripLv * 0.08;
        const eventMult     = activeForgeEvent?.effect === 'strike_multiplier' ? activeForgeEvent.value : 1;
        const totalMult     = anvilMult * eventMult;
        const effectiveStrikeScore = Math.min(maxScore * totalMult, totalStrikeScore * totalMult);
        const miniGameBonus = maxScore > 0 ? (effectiveStrikeScore / maxScore) * 50 : 25;
        const forgeSkillBonus = Math.min(40, (game.player.skills['forge'] ?? 1) * 4);
        let qualityScore = Math.min(100, Math.round(10 + forgeSkillBonus + miniGameBonus));
        const FORGE_QUALITY_PCT = [0, 5, 10, 15, 22, 30];
        qualityScore = Math.min(100, Math.round(qualityScore * (1 + FORGE_QUALITY_PCT[Math.min(forgeUpgLevel, 5)] / 100)));
        const QUENCH_FLAT = [0, 4, 8, 12, 18, 25];
        qualityScore = Math.min(100, qualityScore + (QUENCH_FLAT[Math.min(quickQuenchLv, 5)] ?? 0));
        if (anvilLevel >= 5) qualityScore = Math.max(qualityScore, 60);
        if (activeForgeEvent?.effect === 'bonus_score') qualityScore = Math.min(100, qualityScore + activeForgeEvent.value);
        if (activeForgeEvent?.effect === 'min_score')   qualityScore = Math.max(qualityScore, activeForgeEvent.value);
        // ── Apply quench bonus/penalty ──────────────────────────────────
        qualityScore = Math.min(100, Math.max(1, qualityScore + quenchMod));

        const recipeLevel = activeRecipeRef.current?.levelRequired ?? 0;
        if (recipeLevel >= 5) {
          // Rare+ recipe → show the forge enigma before finalising the craft
          setPendingEnigma({ recipeId, qualityScore });
        } else {
          const item = game.craftItemWithScore(recipeId, qualityScore);
          if (item) {
            setCraftedItem(item);
            AudioManager.playCraftComplete();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
          setRewardDoubled(false);
          setCraftPhase('RESULT');
        }
      }, 750);
    };

    runResultRef.current = runResult;

    // ── Progress bar: 100 → 0 in 2 800 ms (70 steps × 40 ms) ──────────────
    const STEPS = 70;
    const STEP_SIZE = 100 / STEPS;
    // eslint-disable-next-line prefer-const
    let intervalId = setInterval(() => {
      quenchProgressRef.current = Math.max(0, quenchProgressRef.current - STEP_SIZE);
      setQuenchProgress(quenchProgressRef.current);
      if (quenchProgressRef.current <= 0 && !quenchDoneRef.current) {
        // Auto-quench: metal too cold → small penalty
        runResult(-4);
      }
    }, 40);

    return () => { clearInterval(intervalId); runResultRef.current = null; };
  }, [craftPhase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Temperature: cool while hammering; reset on any other phase ──────────
  useEffect(() => {
    if (craftPhase !== 'HAMMERING') {
      setTemperature(0);
      setOverheated(false);
      temperatureRef.current = 0;
      return;
    }
    const id = setInterval(() => {
      setTemperature((prev) => {
        const next = Math.max(0, prev - 6);
        temperatureRef.current = next;
        return next;
      });
    }, 300);
    return () => clearInterval(id);
  }, [craftPhase]);

  // ─── Actions ─────────────────────────────────────────────────────────────
  const startCraft = (recipe: RecipeData) => {
    if (!game.canCraftRecipe(recipe.id)) return;
    setShowRecipeSheet(false);
    setSession({ recipeId: recipe.id, strikesCompleted: 0, strikeScores: [] });
    setHeatingProgress(0);
    setCraftedItem(null);
    activeRecipeRef.current = recipe;
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

    // ── Temperature rise (+25 per tap; capped at 110) ──────────────────────
    const newTemp = Math.min(110, temperatureRef.current + 25);
    temperatureRef.current = newTemp;
    setTemperature(newTemp);

    // Overheat? Force RATÉ and give error feedback
    let finalScore = score;
    let finalLabel = label;
    if (newTemp >= 100) {
      finalScore = 0;
      finalLabel = 'RATÉ';
      setOverheated(true);
      setTimeout(() => setOverheated(false), 1100);
      AudioManager.playError();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      // Normal sound feedback
      if (score === 25) AudioManager.playPerfectStrike();
      else if (score > 0)  AudioManager.playHammerStrike();
      else                 AudioManager.playError();
    }

    setLastHitLabel(finalLabel);
    if (hitTimerRef.current) clearTimeout(hitTimerRef.current);
    hitTimerRef.current = setTimeout(() => setLastHitLabel(null), 900);

    setSession((prev) => {
      const newStrikes = prev.strikesCompleted + 1;
      const newScores = [...prev.strikeScores, finalScore];
      if (newStrikes >= 5) {
        setTimeout(() => setCraftPhase('COOLING'), 400);
      }
      return { ...prev, strikesCompleted: newStrikes, strikeScores: newScores };
    });
  };

  const handleQuench = () => {
    if (craftPhase !== 'COOLING' || quenchDoneRef.current || quenchTapped) return;
    const p = quenchProgressRef.current;

    let mod = 0;
    let label = '';
    if (p >= 42 && p <= 58) {
      mod = 10; label = '💎 PARFAIT! +10 qualité';
      AudioManager.playPerfectStrike();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (p >= 30 && p <= 70) {
      mod = 5; label = '💧 BIEN! +5 qualité';
      AudioManager.playHammerStrike();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else if (p > 70) {
      mod = -8; label = '🔥 TROP TÔT! -8 qualité';
      AudioManager.playError();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } else {
      mod = -5; label = '❄️ TROP TARD! -5 qualité';
      AudioManager.playError();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }

    setQuenchTapped(true);
    setQuenchLabel(label);
    runResultRef.current?.(mod);
  };

  const resetCraft = () => {
    setCraftPhase('IDLE');
    setSession(EMPTY_SESSION);
    setCraftedItem(null);
    setHeatingProgress(0);
    setLastHitLabel(null);
    setTemperature(0);
    setOverheated(false);
    temperatureRef.current = 0;
    setQuenchProgress(100);
    setQuenchTapped(false);
    setQuenchLabel(null);
    quenchProgressRef.current = 100;
    quenchDoneRef.current = false;
  };

  const handleEnigmaResult = (success: boolean) => {
    if (!pendingEnigma) return;
    const item = game.craftItemWithScore(pendingEnigma.recipeId, pendingEnigma.qualityScore, success);
    if (item) {
      setCraftedItem(item);
      AudioManager.playCraftComplete();
      if (success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
    }
    setPendingEnigma(null);
    setRewardDoubled(false);
    setCraftPhase('RESULT');
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
    <View style={[styles.container, { backgroundColor: MEDIEVAL.steelDark }]}>
      {/* ── Photorealistic forge backdrop (ForgeBackdrop: image + effects) ── */}

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: headerTopPad + 10 }]}>
        <View style={styles.headerTopRow}>
          <View style={styles.headerLeft}>
            <View style={{ alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <View style={md.levelRing}>
                <View style={md.levelRingInner}>
                  <Text style={md.levelRingText}>{player.level}</Text>
                </View>
              </View>
              <View style={md.forgeRing}>
                <Text style={md.forgeRingText}>{forgeSkillLevel}</Text>
              </View>
            </View>
            <View>
              <Text style={md.headerTitle}>FORGERON</Text>
              <Text style={md.headerXP}>
                {player.xp.toLocaleString()} / {player.xpToNextLevel.toLocaleString()} XP
              </Text>
              <View style={md.headerXPTrack}>
                <View style={[md.headerXPFill, { width: `${xpPct}%` as `${number}%` }]} />
              </View>
              <Text style={[md.headerTitle, { marginTop: 8, color: MEDIEVAL.emberSoft }]}>FORGE</Text>
              <Text style={md.headerXP}>
                {forgeXP.toLocaleString()} / {forgeXPNeeded.toLocaleString()} XP
              </Text>
              <View style={md.headerXPTrack}>
                <View style={[md.headerXPFill, { width: `${forgeXPPct}%` as `${number}%`, backgroundColor: MEDIEVAL.ember }]} />
              </View>
            </View>
          </View>
        <View style={styles.headerRight}>
          <View style={md.pill}>
            <Feather name="award" size={12} color={MEDIEVAL.oldGold} />
            <Text style={[md.pillText, { color: MEDIEVAL.oldGold }]}>
              {player.totalItemsCrafted}
            </Text>
          </View>
          <TouchableOpacity
            style={md.pill}
            onPress={() => router.push('/boutique')}
            activeOpacity={0.8}
          >
            <Feather name="dollar-sign" size={12} color={MEDIEVAL.oldGold} />
            <Text style={[md.pillText, { color: MEDIEVAL.oldGold }]}>
              {player.gold.toLocaleString()}
            </Text>
            <Feather name="plus" size={11} color={MEDIEVAL.textDim} />
          </TouchableOpacity>
          <NeonIconButton
            icon="award"
            color="#00E5FF"
            onPress={() => router.push('/classement')}
            accessibilityLabel="Classement des joueurs"
          />
          <BoutiqueButton />
          {upgradeLevel > 0 && (
            <View style={md.pill}>
              <Feather name="trending-up" size={12} color={MEDIEVAL.emberSoft} />
              <Text style={[md.pillText, { color: MEDIEVAL.emberSoft }]}>+{upgradeLevel}</Text>
            </View>
          )}
          <TouchableOpacity
            style={[md.pill, { position: 'relative' }]}
            onPress={() => setShowOrdersModal(true)}
            activeOpacity={0.8}
          >
            <Feather name="inbox" size={13} color={MEDIEVAL.textDim} />
            {pendingCount > 0 && (
              <View style={md.headerBadge}>
                <Text style={md.headerBadgeText}>{pendingCount}</Text>
              </View>
            )}
            {(() => {
              const urgentCount = pendingOrders.filter((o) => o.isUrgent && o.deadline > Date.now()).length;
              return urgentCount > 0 ? (
                <View style={oStyles.urgentHeaderBadge}>
                  <Text style={oStyles.urgentHeaderBadgeText}>⚡</Text>
                </View>
              ) : null;
            })()}
          </TouchableOpacity>
        </View>
        </View>
      </View>

      {/* ── Left rail ── */}
      {craftPhase === 'IDLE' && (
        <View style={[md.leftRail, { top: 0, bottom: 0, justifyContent: 'center' }]} pointerEvents="box-none">
          <RailButton
            icon="book-open"
            label="QUÊTES"
            onPress={() => router.push('/codex')}
          />
          <RailButton
            icon="zap"
            label="ÉVÉNEMENTS"
            onPress={() => router.push('/world')}
          />
          <RailButton
            icon="user"
            label="APPRENTI"
            onPress={() => setShowApprenticeModal(true)}
          />
          <RailButton
            icon="trending-up"
            label="AMÉLIORER"
            onPress={() => setShowUpgradesModal(true)}
          />
        </View>
      )}

      {/* ── Materials panel, bottom-left, dark ingot cards (always visible, 0 when not owned) ── */}
      {craftPhase === 'IDLE' && (
        <View style={[md.matPanel, { bottom: bottomPad + 12 }]} pointerEvents="none">
          {(() => {
            const owned = game.inventory.slice(0, 6);
            const ownedIds = new Set(owned.map((i) => i.resourceId));
            const fillers = [...game.allResources]
              .sort((a, b) => a.level - b.level)
              .filter((r) => !ownedIds.has(r.id))
              .slice(0, 6 - owned.length);
            const rows = [
              ...owned.map((inv) => ({ res: game.getResourceById(inv.resourceId), qty: inv.quantity, key: inv.resourceId })),
              ...fillers.map((res) => ({ res, qty: 0, key: res.id })),
            ];
            return rows.map(({ res, qty, key }) => {
              const c = res?.color ?? '#8A7A6A';
              return (
                <View key={key} style={md.matRow}>
                  <View>
                    <Text style={[md.matName, { color: c }]}>{(res?.name ?? '?').toUpperCase()}</Text>
                    <Text style={md.matQty}>{qty.toLocaleString()}</Text>
                  </View>
                  <View style={[md.ingotBar, { backgroundColor: c, borderColor: 'rgba(0,0,0,0.45)' }]}>
                    <View style={md.ingotHighlight} />
                  </View>
                </View>
              );
            });
          })()}
        </View>
      )}

      {/* ── 3D Scene (always rendered for audio/particles; hidden in IDLE by opacity) ── */}
      <View style={styles.sceneContainer}>
        {/* Cinematic living backdrop (artwork + embers, smoke, glow, dust) */}
        <ForgeBackdrop />
        {/* 3D hammering scene — only visible during craft phases; in IDLE the
            animated artwork backdrop takes over (ForgeScene3D has an opaque
            background and would otherwise cover it entirely). */}
        <View style={[StyleSheet.absoluteFill, { opacity: craftPhase === 'IDLE' ? 0 : 1 }]} pointerEvents="none">
          <ForgeScene3D ref={sceneRef} craftPhase={craftPhase} upgradeLevel={upgradeLevel} />
        </View>
        <WeatherEffect type={weather} />

        {/* Heating overlay */}
        {craftPhase === 'HEATING' && (
          <View style={[styles.phaseOverlay, { pointerEvents: 'none' }]}>
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
          <View style={[styles.phaseOverlay, { pointerEvents: 'none' }]}>
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
          <View style={[styles.hitFlash, { pointerEvents: 'none' }]}>
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

      {/* ── Bottom action panel ── */}
      <View
        style={[styles.bottomPanel, craftPhase !== 'IDLE' && { backgroundColor: 'rgba(10,7,5,0.85)' }, { pointerEvents: 'box-none' }]}
      >
        {craftPhase === 'IDLE' && (
          <>
            {/* FORGER — artwork button dead center on screen */}
            <View style={[md.forgeOverAnvil, { bottom: winH / 2 + 90 }]} pointerEvents="box-none">
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setShowRecipeSheet(true);
                }}
                onPressIn={onForgePressIn}
                onPressOut={onForgePressOut}
                activeOpacity={1}
              >
                <Animated.View style={{ transform: [{ translateY: forgeFloatY }, { scale: forgePressRef.current }] }}>
                  <Image
                    source={require('../../assets/images/forge-btn.png')}
                    style={md.forgeBtnArt}
                    resizeMode="contain"
                  />
                </Animated.View>
              </TouchableOpacity>
            </View>

          </>
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

            {/* ── Temperature gauge ── */}
            <View style={styles.tempGauge}>
              <Text style={styles.tempIcon}>🌡️</Text>
              <View style={styles.tempTrackWrap}>
                <View style={styles.tempTrack}>
                  <View
                    style={[
                      styles.tempFill,
                      {
                        width: `${Math.min(100, temperature)}%` as `${number}%`,
                        backgroundColor:
                          temperature >= 90 ? '#FF2200'
                          : temperature >= 70 ? '#FF5500'
                          : temperature >= 45 ? '#FF8800'
                          : '#FFAA00',
                      },
                    ]}
                  />
                </View>
                {overheated ? (
                  <Text style={styles.tempOverheatLabel}>💀 SURCHAUFFE — objet endommagé!</Text>
                ) : temperature >= 80 ? (
                  <Text style={[styles.tempWarning, { color: temperature >= 90 ? '#FF2200' : '#FF6600' }]}>
                    ⚠️ Ralentis — métal trop chaud!
                  </Text>
                ) : (
                  <Text style={styles.tempHint}>Frappe régulièrement pour maintenir la chaleur</Text>
                )}
              </View>
              <Text
                style={[
                  styles.tempValue,
                  { color: temperature >= 90 ? '#FF2200' : temperature >= 70 ? '#FF8800' : '#FFAA00' },
                ]}
              >
                {Math.min(100, Math.round(temperature))}°
              </Text>
            </View>

            <HammeringMiniGame
              strikesCompleted={session.strikesCompleted}
              strikeScores={session.strikeScores}
              onStrike={handleStrike}
              forgeSkillLevel={forgeSkillLevel}
            />
          </View>
        )}

        {craftPhase === 'HEATING' && (
          <View style={[styles.inProgressPanel, { paddingBottom: bottomPad + 16 }]}>
            <Feather name="thermometer" size={22} color={colors.primary} />
            <Text style={[styles.inProgressText, { color: colors.mutedForeground }]}>
              Le métal chauffe dans le four…
            </Text>
          </View>
        )}

        {/* ── Quench gauge ── */}
        {craftPhase === 'COOLING' && (
          <View style={[styles.quenchPanel, { paddingBottom: bottomPad + 8 }]}>
            <Text style={styles.quenchTitle}>💧 TREMPAGE</Text>
            <Text style={styles.quenchSubtitle}>
              Retire l'acier quand la barre passe dans la zone verte
            </Text>

            {/* Temperature bar */}
            <View style={styles.quenchTrack}>
              {/* Sweet-zone overlay: 30–70 % */}
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {
                    left: '30%',
                    right: '30%',
                    backgroundColor: 'rgba(0,210,190,0.18)',
                    borderLeftWidth: 2,
                    borderRightWidth: 2,
                    borderColor: 'rgba(0,210,190,0.65)',
                  },
                ]}
              />
              {/* Perfect-zone overlay: 42–58 % */}
              <View
                style={[
                  StyleSheet.absoluteFill,
                  { left: '42%', right: '42%', backgroundColor: 'rgba(0,210,190,0.18)' },
                ]}
              />
              {/* Shrinking heat fill */}
              <View
                style={[
                  styles.quenchFill,
                  {
                    width: `${Math.max(0, quenchProgress)}%` as `${number}%`,
                    backgroundColor:
                      quenchProgress > 70 ? '#E53935'
                      : quenchProgress > 45 ? '#FF8800'
                      : '#00D2BE',
                  },
                ]}
              />
              {/* Zone labels row */}
              <View style={[StyleSheet.absoluteFill, styles.quenchZoneLabels]}>
                <Text style={styles.quenchZoneHot}>🔥</Text>
                <Text style={styles.quenchZoneSweet}>✦ ZONE</Text>
                <Text style={styles.quenchZoneCold}>❄️</Text>
              </View>
            </View>

            {/* Feedback */}
            {quenchLabel ? (
              <Text
                style={[
                  styles.quenchFeedback,
                  {
                    color: quenchLabel.includes('PARFAIT') ? '#00D2BE'
                      : quenchLabel.includes('BIEN') ? '#66BB6A'
                      : '#EF5350',
                  },
                ]}
              >
                {quenchLabel}
              </Text>
            ) : (
              <Text style={styles.quenchFeedback}> </Text>
            )}

            {/* Action button / waiting */}
            {!quenchTapped ? (
              <TouchableOpacity
                style={[
                  styles.quenchBtn,
                  {
                    borderColor:
                      quenchProgress >= 30 && quenchProgress <= 70
                        ? '#00D2BE'
                        : 'rgba(255,255,255,0.18)',
                    backgroundColor:
                      quenchProgress >= 30 && quenchProgress <= 70
                        ? 'rgba(0,210,190,0.18)'
                        : 'rgba(255,255,255,0.06)',
                  },
                ]}
                onPress={handleQuench}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.quenchBtnText,
                    {
                      color:
                        quenchProgress >= 30 && quenchProgress <= 70
                          ? '#00D2BE'
                          : 'rgba(255,255,255,0.4)',
                    },
                  ]}
                >
                  💧 SORTIR DU BAIN
                </Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.quenchWaiting}>
                <Text style={styles.quenchWaitingText}>Finition en cours…</Text>
              </View>
            )}
          </View>
        )}
      </View>

      {/* ── Recipe Sheet ── */}
      {/* ── Apprentice modal (hire / manage) ── */}
      <Modal visible={showApprenticeModal} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowApprenticeModal(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: '#171008', borderTopLeftRadius: 18, borderTopRightRadius: 18, borderWidth: 1, borderColor: 'rgba(200,140,60,0.35)', padding: 16, paddingBottom: bottomPad + 16, gap: 12 }}>
            <ApprenticeCard game={game} colors={colors} />
            <TouchableOpacity onPress={() => setShowApprenticeModal(false)} activeOpacity={0.8} style={{ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 24, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(200,140,60,0.35)' }}>
              <Text style={{ color: MEDIEVAL.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 2 }}>FERMER</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
                        {recipe.levelRequired >= 5 && (
                          <View
                            style={[
                              styles.forgeBadge,
                              { backgroundColor: '#E8B84B1A', borderWidth: 1, borderColor: '#E8B84B55' },
                            ]}
                          >
                            <Text style={[styles.forgeBadgeText, { color: '#E8B84B' }]}>DÉFI</Text>
                          </View>
                        )}
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

      {/* ── Forge Enigma Modal ── */}
      {pendingEnigma != null && activeRecipeRef.current != null && (
        <CraftingEnigmaModal
          recipe={activeRecipeRef.current}
          enigmaZoneBonus={
            game.player.talentsUnlocked.includes('forge_enigma_master') ? 0.25 : 0
          }
          onResult={handleEnigmaResult}
        />
      )}

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

              {adsUnlocked && (
                rewardDoubled ? (
                  <View style={[styles.doubleBtn, { backgroundColor: '#E8B84B22', borderColor: '#E8B84B55' }]}>
                    <Feather name="check-circle" size={15} color="#E8B84B" />
                    <Text style={[styles.doubleBtnText, { color: '#E8B84B' }]}>Récompense doublée ✦</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.doubleBtn, { backgroundColor: '#E8B84B', borderColor: '#8A6A2A' }]}
                    disabled={adBusy}
                    onPress={async () => {
                      setAdBusy(true);
                      try {
                        const watched = await showRewardedAd('double_craft_reward');
                        if (watched && !rewardDoubled) {
                          const xp = selectedRecipe?.xpReward ?? 0;
                          const goldBonus = Math.max(10, Math.round((craftedItem?.value ?? 0) / 2));
                          if (xp > 0) {
                            game.addPlayerXP(xp);
                            game.addSkillXP(selectedRecipe?.skillRequired ?? 'forge', xp);
                          }
                          game.addGold(goldBonus);
                          setRewardDoubled(true);
                          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                        }
                      } finally {
                        setAdBusy(false);
                      }
                    }}
                  >
                    <Feather name="film" size={15} color="#1A1208" />
                    <Text style={[styles.doubleBtnText, { color: '#1A1208' }]}>
                      Doubler la récompense (pub)
                    </Text>
                  </TouchableOpacity>
                )
              )}

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

// ─── Idle Panel ──────────────────────────────────────────────────────────────
// ─── Medieval styles ─────────────────────────────────────────────────────────
const md = StyleSheet.create({
  // Header
  levelRing: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: MEDIEVAL.oldGold,
    backgroundColor: 'rgba(12,9,6,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.6,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  levelRingInner: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(200,140,60,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelRingText: { color: MEDIEVAL.oldGold, fontSize: 15, fontWeight: '900' },
  headerTitle: { color: MEDIEVAL.textLight, fontSize: 15, fontWeight: '900', letterSpacing: 3 },
  headerXP: { color: MEDIEVAL.textDim, fontSize: 9, fontWeight: '600', letterSpacing: 0.5, marginTop: 1 },
  headerXPTrack: {
    width: 96,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 3,
    overflow: 'hidden',
  },
  headerXPFill: { height: '100%', borderRadius: 2, backgroundColor: MEDIEVAL.oldGold },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: MEDIEVAL.panel,
    borderWidth: 1,
    borderColor: MEDIEVAL.border,
  },
  pillText: { fontSize: 12, fontWeight: '800' },

  // Left rail
  leftRail: {
    position: 'absolute',
    left: 12,
    zIndex: 10,
    gap: 26,
  },
  railBtn: { alignItems: 'center', width: 64 },
  railBtnCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: MEDIEVAL.panelLight,
    borderWidth: 1.5,
    borderColor: MEDIEVAL.border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  railBtnLabel: {
    color: MEDIEVAL.textDim,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
    marginTop: 4,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    backgroundColor: '#C0392B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  badgeText: { color: '#fff', fontSize: 9, fontWeight: '900' },

  // Materials rail
  materialsRail: {
    position: 'absolute',
    right: 12,
    zIndex: 10,
    width: 132,
    maxHeight: 300,
    borderRadius: 10,
    backgroundColor: MEDIEVAL.panel,
    borderWidth: 1,
    borderColor: MEDIEVAL.border,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  materialsTitle: {
    color: MEDIEVAL.oldGold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.5,
    textAlign: 'center',
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(200,140,60,0.25)',
    paddingBottom: 5,
  },
  materialsScroll: { flexGrow: 0 },
  materialsEmpty: { color: MEDIEVAL.textDim, fontSize: 10, textAlign: 'center', paddingVertical: 8 },
  ingotRail: { position: 'absolute', right: 10, alignItems: 'flex-end', gap: 12 },
  ingotRow: { alignItems: 'center', gap: 3 },
  ingotBar: {
    width: 46,
    height: 16,
    borderRadius: 3,
    borderWidth: 1,
    transform: [{ skewX: '-14deg' }],
    overflow: 'hidden',
  },
  ingotHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '55%',
    backgroundColor: 'rgba(255,255,255,0.30)',
  },
  ingotQty: { color: '#F5E6C8', fontSize: 10, fontWeight: '800' },
  matPanel: { position: 'absolute', left: 10, gap: 8 },
  matRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    width: 126,
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 9,
    backgroundColor: 'rgba(12,8,5,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(200,140,60,0.4)',
  },
  matName: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  matQty: { color: '#F5E6C8', fontSize: 11, fontWeight: '700', marginTop: 1 },
  materialRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  materialChip: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  materialName: { flex: 1, color: MEDIEVAL.textLight, fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },
  materialQty: { color: MEDIEVAL.oldGold, fontSize: 10, fontWeight: '800' },

  // Idle action panel
  idlePanel: { paddingHorizontal: 16 },
  statsStrip: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  statBox: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: MEDIEVAL.panel,
    borderWidth: 1,
    borderColor: MEDIEVAL.border,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  statLabel: { color: MEDIEVAL.textDim, fontSize: 8, fontWeight: '800', letterSpacing: 1.5 },
  statValue: { color: MEDIEVAL.textLight, fontSize: 13, fontWeight: '800', marginTop: 1 },
  statTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginTop: 4,
    overflow: 'hidden',
  },
  statFill: { height: '100%', borderRadius: 2 },
  headerStats: { flexDirection: 'row', gap: 8, marginTop: 10 },
  headerStatBox: { flex: 1 },
  headerStatTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 },
  headerStatValue: { color: MEDIEVAL.textLight, fontSize: 11, fontWeight: '800' },
  forgeRing: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: MEDIEVAL.ember,
    backgroundColor: 'rgba(16,10,6,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  forgeRingText: { color: MEDIEVAL.emberSoft, fontSize: 14, fontWeight: '800' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 8,
    marginTop: 4,
  },
  centerActions: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
  actionsBand: { backgroundColor: 'rgba(0,0,0,0.88)', paddingVertical: 20, paddingHorizontal: 16 },
  forgeOverAnvil: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  bottomRoundBtn: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  ameliorerBtn: { position: 'absolute', right: 16 },
  sideBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(16,10,6,0.55)',
    borderWidth: 1,
    borderColor: 'rgba(200,140,60,0.35)',
  },
  sideBtnText: { color: MEDIEVAL.textLight, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  forgeBtnArt: { width: 190, height: 118 },
  headerBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 15,
    height: 15,
    borderRadius: 8,
    backgroundColor: '#C0392B',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  headerBadgeText: { color: '#FFF', fontSize: 8, fontWeight: '800' },
  inventoryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: MEDIEVAL.panel,
    borderWidth: 1,
    borderColor: MEDIEVAL.border,
  },
  inventoryBtnText: { color: MEDIEVAL.textDim, fontSize: 11, fontWeight: '800', letterSpacing: 2 },
});

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
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  headerTitle: { fontSize: 17, fontWeight: '800', letterSpacing: 3 },
  headerForgeName: { fontSize: 11, fontWeight: '500', letterSpacing: 1, marginTop: 1 },
  headerRight: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    alignContent: 'center',
    gap: 7,
    maxWidth: 168,
  },
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
  bottomPanel: {},
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
  // ── Quench gauge ─────────────────────────────────────────────────────────
  quenchPanel: {
    paddingHorizontal: 20,
    paddingTop: 14,
    gap: 10,
  },
  quenchTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#00D2BE',
    letterSpacing: 2,
    textAlign: 'center',
  },
  quenchSubtitle: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
  quenchTrack: {
    height: 30,
    borderRadius: 15,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    position: 'relative',
  },
  quenchFill: {
    height: '100%',
    borderRadius: 15,
  },
  quenchZoneLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  quenchZoneHot:   { fontSize: 13 },
  quenchZoneSweet: { fontSize: 9, fontWeight: '900', color: '#00D2BE', letterSpacing: 1 },
  quenchZoneCold:  { fontSize: 13 },
  quenchFeedback: {
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 0.8,
    minHeight: 18,
  },
  quenchBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quenchBtnText: { fontSize: 15, fontWeight: '900', letterSpacing: 2 },
  quenchWaiting: { paddingVertical: 14, alignItems: 'center' },
  quenchWaitingText: { fontSize: 13, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' },

  // ── Temperature gauge ────────────────────────────────────────────────────
  tempGauge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 4,
  },
  tempIcon: { fontSize: 20 },
  tempTrackWrap: { flex: 1, gap: 4 },
  tempTrack: {
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  tempFill: {
    height: '100%',
    borderRadius: 6,
    minWidth: 3,
  },
  tempHint: { fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.3 },
  tempWarning: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  tempOverheatLabel: { fontSize: 11, fontWeight: '900', color: '#FF2200', letterSpacing: 1 },
  tempValue: { fontSize: 15, fontWeight: '900', minWidth: 34, textAlign: 'right' },

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
  doubleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 11,
    marginTop: 12,
    alignSelf: 'stretch',
  },
  doubleBtnText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
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
