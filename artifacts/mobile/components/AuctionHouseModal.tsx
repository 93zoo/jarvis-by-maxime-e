/**
 * AuctionHouseModal — Hôtel des Ventes automatique
 *
 * Modal 3 onglets : Vendre / En cours / Terminées.
 * Les enchères PNJ se règlent automatiquement en arrière-plan.
 *
 * Hermes hoisting rule: sous-composants avec hooks définis AVANT le composant principal.
 */
import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useGame } from '@/context/GameContext';
import type { AuctionListing, AuctionResult, Item } from '@/types/game';
import { getMarketEventType } from '@/data/marketEvents';
import { AUCTION_DURATION_BY_RARITY } from '@/config/marketConfig';

// ── Constants ──────────────────────────────────────────────────────────────────

const RARITY_COLOR: Record<string, string> = {
  common: '#AAAAAA', uncommon: '#44FF44', rare: '#4488FF',
  epic: '#AA44FF', legendary: '#FFAA00',
};

const RARITY_LABEL: Record<string, string> = {
  common: 'Commun', uncommon: 'Peu commun', rare: 'Rare',
  epic: 'Épique', legendary: 'Légendaire',
};

const QUALITY_COLOR: Record<string, string> = {
  poor: '#888', normal: '#BBB', good: '#4488FF',
  excellent: '#AA44FF', legendary: '#FFAA00',
};

const QUALITY_LABEL: Record<string, string> = {
  poor: 'Médiocre', normal: 'Normal', good: 'Bon',
  excellent: 'Excellent', legendary: 'Légendaire',
};

const CATEGORY_ICON: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  sword: 'flash', axe: 'cut', hammer: 'hammer', lance: 'arrow-up',
  shield: 'shield', armor: 'body', helmet: 'ellipse',
  ring: 'radio-button-off', amulet: 'diamond', dagger: 'remove',
  crown: 'star', tool: 'build', decoration: 'color-palette',
};

type AHTab = 'sell' | 'active' | 'completed';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatGold(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 10_000) return `${Math.round(amount / 1_000)}k`;
  return amount.toString();
}

function formatDurationShort(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  return `${Math.round(min / 60)} h`;
}

// ── Sub-component: Countdown timer (hooks → must be before main component) ─────

function AuctionCountdown({ listedAt, durationMs }: { listedAt: number; durationMs: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, listedAt + durationMs - Date.now()));

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => {
      const left = Math.max(0, listedAt + durationMs - Date.now());
      setRemaining(left);
    }, 1000);
    return () => clearInterval(id);
  }, [listedAt, durationMs]);

  if (remaining <= 0) return <Text style={cd.done}>Résolution…</Text>;

  const totalSec = Math.ceil(remaining / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const label = h > 0 ? `${h}h ${m.toString().padStart(2, '0')}m` : `${m}:${s.toString().padStart(2, '0')}`;

  return (
    <View style={cd.row}>
      <Ionicons name="time-outline" size={11} color="#888" />
      <Text style={cd.text}> {label}</Text>
    </View>
  );
}
const cd = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  text: { fontSize: 11, color: '#888' },
  done: { fontSize: 11, color: '#FFD700', marginTop: 2 },
});

// ── Sub-component: Item card for the Sell tab ──────────────────────────────────

function SellItemCard({
  item,
  estimatedPrice,
  durationMs,
  onList,
}: {
  item: Item;
  estimatedPrice: number;
  durationMs: number;
  onList: () => void;
}) {
  const rarityColor = RARITY_COLOR[item.rarity] ?? '#888';
  const qualityColor = QUALITY_COLOR[item.quality] ?? '#888';
  const catIcon = CATEGORY_ICON[item.category] ?? 'construct';
  return (
    <View style={mc.itemCard}>
      <View style={[mc.catIconWrap, { backgroundColor: rarityColor + '22' }]}>
        <Ionicons name={catIcon} size={18} color={rarityColor} />
      </View>
      <View style={mc.itemInfo}>
        <Text style={[mc.itemName, { color: rarityColor }]} numberOfLines={1}>{item.name}</Text>
        <View style={mc.badgeRow}>
          <Text style={[mc.badge, { color: qualityColor, borderColor: qualityColor + '66' }]}>
            {QUALITY_LABEL[item.quality] ?? item.quality}
          </Text>
          <Text style={[mc.badge, { color: rarityColor, borderColor: rarityColor + '66' }]}>
            {RARITY_LABEL[item.rarity] ?? item.rarity}
          </Text>
        </View>
        <View style={mc.priceRow}>
          <Ionicons name="cash-outline" size={11} color="#FFD700" />
          <Text style={mc.estimatedPrice}> ~{formatGold(estimatedPrice)} pO</Text>
          <Text style={mc.duration}>  ·  {formatDurationShort(durationMs)}</Text>
        </View>
      </View>
      <TouchableOpacity style={mc.listBtn} onPress={onList} activeOpacity={0.8}>
        <Ionicons name="storefront-outline" size={14} color="#FFD700" />
        <Text style={mc.listBtnTxt}>Vendre</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Sub-component: Active listing card ────────────────────────────────────────

function ActiveListingCard({ listing }: { listing: AuctionListing }) {
  const rarityColor = RARITY_COLOR[listing.itemRarity] ?? '#888';
  const catIcon = CATEGORY_ICON[listing.itemCategory] ?? 'construct';
  return (
    <View style={mc.itemCard}>
      <View style={[mc.catIconWrap, { backgroundColor: rarityColor + '22' }]}>
        <Ionicons name={catIcon} size={18} color={rarityColor} />
      </View>
      <View style={mc.itemInfo}>
        <Text style={[mc.itemName, { color: rarityColor }]} numberOfLines={1}>{listing.itemName}</Text>
        <Text style={mc.duration}>{RARITY_LABEL[listing.itemRarity] ?? listing.itemRarity}</Text>
        <View style={mc.priceRow}>
          <Ionicons name="cash-outline" size={11} color="#FFD700" />
          <Text style={mc.estimatedPrice}> ~{formatGold(listing.estimatedPrice)} pO</Text>
        </View>
        <AuctionCountdown listedAt={listing.listedAt} durationMs={listing.durationMs} />
      </View>
      <View style={mc.pendingBadge}>
        <Ionicons name="hourglass-outline" size={13} color="#FFD700" />
        <Text style={mc.pendingTxt}>Enchère</Text>
      </View>
    </View>
  );
}

// ── Sub-component: Completed result card ─────────────────────────────────────

function ResultCard({ result, onClaim }: { result: AuctionResult; onClaim: () => void }) {
  const rarityColor = RARITY_COLOR[result.itemRarity] ?? '#888';
  const catIcon = CATEGORY_ICON[result.itemCategory] ?? 'construct';
  return (
    <View style={[mc.itemCard, result.claimed && mc.itemCardClaimed]}>
      <View style={[mc.catIconWrap, { backgroundColor: rarityColor + '22' }]}>
        <Ionicons name={catIcon} size={18} color={result.claimed ? '#444' : rarityColor} />
      </View>
      <View style={mc.itemInfo}>
        <Text style={[mc.itemName, { color: result.claimed ? '#555' : rarityColor }]} numberOfLines={1}>
          {result.itemName}
        </Text>
        {result.exceptionalLabel ? (
          <Text style={mc.exceptionalLabel}>{result.exceptionalLabel}</Text>
        ) : null}
        <View style={mc.priceRow}>
          <Ionicons name="cash" size={12} color={result.claimed ? '#555' : '#FFD700'} />
          <Text style={[mc.soldPrice, result.claimed && mc.soldPriceClaimed]}>
            {' '}{formatGold(result.soldPrice)} pièces d'or
          </Text>
        </View>
      </View>
      {result.claimed ? (
        <View style={mc.claimedBadge}>
          <Ionicons name="checkmark-circle" size={16} color="#444" />
        </View>
      ) : (
        <TouchableOpacity style={mc.claimBtn} onPress={onClaim} activeOpacity={0.8}>
          <Text style={mc.claimBtnTxt}>Réclamer</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface AuctionHouseModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function AuctionHouseModal({ visible, onClose }: AuctionHouseModalProps) {
  const game = useGame();
  const [activeTab, setActiveTab] = useState<AHTab>('sell');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Items available to list (not already in an active auction)
  const listedInstanceIds = useMemo(
    () => new Set(game.auctionListings.map((l: AuctionListing) => l.itemInstanceId)),
    [game.auctionListings],
  );

  const availableItems = useMemo(
    () => game.craftedItems.filter((i: Item) => !listedInstanceIds.has(i.instanceId)),
    [game.craftedItems, listedInstanceIds],
  );

  const unclaimedResults = useMemo(
    () => game.auctionResults.filter((r: AuctionResult) => !r.claimed),
    [game.auctionResults],
  );

  // Active market events (not yet expired)
  const now = Date.now();
  const activeEvents = useMemo(
    () => game.activeMarketEvents.filter((e) => e.startedAt + e.durationMs > now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game.activeMarketEvents],
  );

  // Show feedback briefly
  const showFeedback = useCallback((msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => setFeedbackMsg(null), 2500);
  }, []);

  function handleListItem(item: Item) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = game.listItemForAuction(item.instanceId);
    if (result.success) {
      showFeedback(`${item.name} mis en vente !`);
      setActiveTab('active');
    } else {
      showFeedback(result.message);
    }
  }

  function handleClaim(resultId: string) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const result = game.claimAuctionGold(resultId);
    if (result.success) showFeedback(`+${formatGold(result.gold)} pièces d'or réclamées !`);
  }

  function handleClaimAll() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const total = game.claimAllAuctionGold();
    if (total > 0) showFeedback(`+${formatGold(total)} pièces d'or réclamées !`);
  }

  const completedCount = game.auctionResults.filter((r: AuctionResult) => !r.claimed).length;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={mc.overlay}>
        <View style={mc.sheet}>

          {/* ── Header ── */}
          <View style={mc.header}>
            <View style={mc.headerLeft}>
              <Ionicons name="storefront" size={20} color="#FFD700" />
              <Text style={mc.headerTitle}>Hôtel des Ventes</Text>
            </View>
            <TouchableOpacity style={mc.closeBtn} onPress={onClose}>
              <Ionicons name="close" size={22} color="#888" />
            </TouchableOpacity>
          </View>

          {/* ── Active market events ── */}
          {activeEvents.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={mc.eventsRow}
              contentContainerStyle={mc.eventsContent}
            >
              {activeEvents.map((ev) => {
                const et = getMarketEventType(ev.eventTypeId);
                if (!et) return null;
                const remaining = ev.startedAt + ev.durationMs - Date.now();
                const remMin = Math.max(0, Math.round(remaining / 60_000));
                return (
                  <View key={ev.instanceId} style={[mc.eventBadge, { borderColor: et.color + '88', backgroundColor: et.color + '18' }]}>
                    <Ionicons name={et.icon as React.ComponentProps<typeof Ionicons>['name']} size={12} color={et.color} />
                    <Text style={[mc.eventLabel, { color: et.color }]}>{et.label}</Text>
                    <Text style={mc.eventTimer}>{remMin}m</Text>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* ── Feedback toast ── */}
          {feedbackMsg ? (
            <View style={mc.feedbackBanner}>
              <Ionicons name="checkmark-circle" size={14} color="#44FF88" />
              <Text style={mc.feedbackText}>{feedbackMsg}</Text>
            </View>
          ) : null}

          {/* ── Tab bar ── */}
          <View style={mc.tabBar}>
            {([
              ['sell', 'Vendre', availableItems.length],
              ['active', 'En cours', game.auctionListings.length],
              ['completed', 'Terminées', completedCount],
            ] as [AHTab, string, number][]).map(([tab, label, count]) => (
              <TouchableOpacity
                key={tab}
                style={[mc.tabBtn, activeTab === tab && mc.tabBtnActive]}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={[mc.tabBtnTxt, activeTab === tab && mc.tabBtnTxtActive]}>
                  {label}{count > 0 ? ` (${count})` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── Content ── */}
          <View style={mc.content}>

            {/* Tab: Vendre */}
            {activeTab === 'sell' && (
              <ScrollView style={mc.list} showsVerticalScrollIndicator={false} contentContainerStyle={mc.listContent}>
                {availableItems.length === 0 ? (
                  <View style={mc.empty}>
                    <Ionicons name="cube-outline" size={36} color="#333" />
                    <Text style={mc.emptyTxt}>Aucun objet forgé disponible.</Text>
                    <Text style={mc.emptySubTxt}>Forgez des objets pour les mettre en vente ici.</Text>
                  </View>
                ) : (
                  availableItems.map((item: Item) => {
                    const dur = AUCTION_DURATION_BY_RARITY[item.rarity] ?? 10 * 60_000;
                    const est = game.estimateAuctionPrice(item);
                    return (
                      <SellItemCard
                        key={item.instanceId}
                        item={item}
                        estimatedPrice={est}
                        durationMs={dur}
                        onList={() => handleListItem(item)}
                      />
                    );
                  })
                )}
              </ScrollView>
            )}

            {/* Tab: En cours */}
            {activeTab === 'active' && (
              <ScrollView style={mc.list} showsVerticalScrollIndicator={false} contentContainerStyle={mc.listContent}>
                {game.auctionListings.length === 0 ? (
                  <View style={mc.empty}>
                    <Ionicons name="hourglass-outline" size={36} color="#333" />
                    <Text style={mc.emptyTxt}>Aucune enchère en cours.</Text>
                    <Text style={mc.emptySubTxt}>Mettez un objet forgé en vente depuis l'onglet Vendre.</Text>
                  </View>
                ) : (
                  game.auctionListings.map((listing: AuctionListing) => (
                    <ActiveListingCard key={listing.id} listing={listing} />
                  ))
                )}
              </ScrollView>
            )}

            {/* Tab: Terminées */}
            {activeTab === 'completed' && (
              <>
                {unclaimedResults.length > 1 && (
                  <TouchableOpacity style={mc.claimAllBtn} onPress={handleClaimAll} activeOpacity={0.8}>
                    <Ionicons name="bag-add" size={15} color="#FFD700" />
                    <Text style={mc.claimAllTxt}>
                      Réclamer tout — {formatGold(unclaimedResults.reduce((s, r) => s + r.soldPrice, 0))} pO
                    </Text>
                  </TouchableOpacity>
                )}
                <ScrollView style={mc.list} showsVerticalScrollIndicator={false} contentContainerStyle={mc.listContent}>
                  {game.auctionResults.length === 0 ? (
                    <View style={mc.empty}>
                      <Ionicons name="cash-outline" size={36} color="#333" />
                      <Text style={mc.emptyTxt}>Aucune vente terminée.</Text>
                      <Text style={mc.emptySubTxt}>Les résultats apparaîtront ici automatiquement.</Text>
                    </View>
                  ) : (
                    game.auctionResults.map((result: AuctionResult) => (
                      <ResultCard
                        key={result.id}
                        result={result}
                        onClaim={() => handleClaim(result.id)}
                      />
                    ))
                  )}
                </ScrollView>
              </>
            )}

          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const mc = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#12121E',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    maxHeight: '92%', minHeight: '60%',
  },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#2A2A40',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFD700', letterSpacing: 0.5 },
  closeBtn: { padding: 4 },

  // Market events row
  eventsRow: { maxHeight: 38, borderBottomWidth: 1, borderBottomColor: '#1E1E30' },
  eventsContent: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 6 },
  eventBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, borderWidth: 1,
  },
  eventLabel: { fontSize: 11, fontWeight: '600' },
  eventTimer: { fontSize: 10, color: '#666' },

  // Feedback toast
  feedbackBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 14, paddingVertical: 6,
    backgroundColor: '#1A2A1A', borderBottomWidth: 1, borderBottomColor: '#2A4A2A',
  },
  feedbackText: { fontSize: 13, color: '#44FF88', fontWeight: '500' },

  // Tabs
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#2A2A40' },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#FFD700' },
  tabBtnTxt: { fontSize: 12, color: '#555', fontWeight: '500' },
  tabBtnTxtActive: { color: '#FFD700', fontWeight: '700' },

  content: { flex: 1 },
  list: { flex: 1 },
  listContent: { padding: 12, paddingBottom: 24 },

  // Claim-all button
  claimAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    margin: 10, paddingVertical: 10, borderRadius: 10,
    backgroundColor: '#FFD70022', borderWidth: 1, borderColor: '#FFD70055',
  },
  claimAllTxt: { color: '#FFD700', fontSize: 13, fontWeight: '700' },

  // Item cards
  itemCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1A1A2C', borderRadius: 10, padding: 10,
    marginBottom: 8, borderWidth: 1, borderColor: '#2A2A3E', gap: 10,
  },
  itemCardClaimed: { opacity: 0.45 },
  catIconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 13, fontWeight: '600', marginBottom: 3 },
  badgeRow: { flexDirection: 'row', gap: 5, marginBottom: 4 },
  badge: { fontSize: 10, fontWeight: '500', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, borderWidth: 1 },
  priceRow: { flexDirection: 'row', alignItems: 'center' },
  estimatedPrice: { fontSize: 12, color: '#FFD700', fontWeight: '600' },
  duration: { fontSize: 11, color: '#555' },

  // Sell tab
  listBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
    backgroundColor: '#FFD70022', borderWidth: 1, borderColor: '#FFD70066',
  },
  listBtnTxt: { color: '#FFD700', fontSize: 12, fontWeight: '700' },

  // Active tab
  pendingBadge: { alignItems: 'center', gap: 2 },
  pendingTxt: { fontSize: 10, color: '#FFD700' },

  // Completed tab
  soldPrice: { fontSize: 13, color: '#FFD700', fontWeight: '700' },
  soldPriceClaimed: { color: '#555' },
  exceptionalLabel: { fontSize: 11, color: '#FF8844', fontWeight: '600', marginBottom: 2 },
  claimBtn: {
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
    backgroundColor: '#44CC6622', borderWidth: 1, borderColor: '#44CC6688',
  },
  claimBtnTxt: { color: '#44CC66', fontSize: 12, fontWeight: '700' },
  claimedBadge: { paddingHorizontal: 6 },

  // Empty state
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 40, gap: 8 },
  emptyTxt: { fontSize: 14, color: '#444', fontWeight: '600', textAlign: 'center' },
  emptySubTxt: { fontSize: 12, color: '#333', textAlign: 'center' },
});
