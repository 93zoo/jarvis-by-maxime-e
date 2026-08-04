import React, { useState, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal,
  StyleSheet, Platform, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from '@/lib/LinearGradientSafe';
import { useColors } from '@/hooks/useColors';
import { useGame } from '@/context/GameContext';
import type { ItemSet } from '@/types/game';
import { ALL_MICRO_COMBOS, type MicroCombo } from '@/utils/microCombos';

// ─── Constants ────────────────────────────────────────────────────────────────
const RARITY_COLORS: Record<string, string> = {
  common:    '#9E9E9E',
  rare:      '#2196F3',
  epic:      '#9C27B0',
  legendary: '#FF8F00',
  mythic:    '#E91E63',
};
const RARITY_LABELS: Record<string, string> = {
  common: 'Commun', rare: 'Rare', epic: 'Épique', legendary: 'Légendaire', mythic: 'Mythique',
};
const BONUS_LABELS: Record<string, string> = {
  orderGoldBonus:    'Or des commandes',
  reputationBonus:   'Réputation NPC',
  qualityBonus:      'Qualité (bonus)',
  forgeXpBonus:      'XP de forge',
  dropBonus:         'Récolte',
  craftSpeedBonus:   'Vitesse de forge',
  marketValueBonus:  'Prix de vente',
};
const FILTERS = ['Tous', 'Commun', 'Rare', 'Épique', 'Légendaire', 'Mythique'] as const;
const FILTER_KEYS: Record<string, string> = {
  'Tous': '', 'Commun': 'common', 'Rare': 'rare',
  'Épique': 'epic', 'Légendaire': 'legendary', 'Mythique': 'mythic',
};

// ─── Sub-components (must be defined BEFORE the main screen — Hermes rule) ────

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Terminé';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function EventBanner({
  game, colors,
}: {
  game: ReturnType<typeof useGame>;
  colors: ReturnType<typeof useColors>;
}) {
  // Tick every second so the countdown stays live and the banner swaps
  // automatically when the event rotates.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const active = game.getActiveEvent();
  if (!active) return null;
  const { event, endsAt } = active;
  const progress = game.getEventProgress();
  const activeTiers = event.bonuses.filter(t => progress.count >= t.count);
  const currentTier = activeTiers.length > 0 ? activeTiers[activeTiers.length - 1] : null;
  const remaining = endsAt - now;

  return (
    <View style={evStyles.wrapper}>
      <LinearGradient
        colors={[colors.primary + '33', colors.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[evStyles.card, { borderColor: colors.primary + '77' }]}
      >
        {/* Header row */}
        <View style={evStyles.headerRow}>
          <View style={[evStyles.iconWrap, { backgroundColor: colors.primary + '22', borderColor: colors.primary + '66' }]}>
            <MaterialCommunityIcons name={event.icon as any} size={24} color={colors.primary} />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={[evStyles.overline, { color: colors.primary }]}>ÉVÉNEMENT EN COURS</Text>
            <Text style={[evStyles.name, { color: colors.foreground }]} numberOfLines={1}>{event.name}</Text>
          </View>
          <View style={[evStyles.timerBadge, { backgroundColor: colors.background + 'CC', borderColor: colors.primary + '55' }]}>
            <MaterialCommunityIcons name="timer-sand" size={13} color={colors.primary} />
            <Text style={[evStyles.timerText, { color: colors.primary }]}>{formatCountdown(remaining)}</Text>
          </View>
        </View>

        <Text style={[evStyles.description, { color: colors.mutedForeground }]} numberOfLines={2}>
          {event.description}
        </Text>

        {/* Combo items */}
        <View style={evStyles.itemsRow}>
          {event.items.map((recipeId) => {
            const crafted = progress.craftedIds.includes(recipeId);
            return (
              <View
                key={recipeId}
                style={[evStyles.itemChip, {
                  backgroundColor: crafted ? colors.primary + '22' : colors.secondary,
                  borderColor: crafted ? colors.primary : colors.border,
                }]}
              >
                <Feather name={crafted ? 'check-circle' : 'circle'} size={12} color={crafted ? colors.primary : colors.mutedForeground} />
                <Text style={[evStyles.itemChipText, { color: crafted ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                  {recipeId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                </Text>
              </View>
            );
          })}
        </View>

        {/* Bonus tiers */}
        {event.bonuses.map((tier) => {
          const reached = progress.count >= tier.count;
          const isCurrent = currentTier?.count === tier.count;
          return (
            <View key={tier.count} style={[evStyles.tierRow, {
              backgroundColor: reached ? colors.primary + '15' : colors.secondary,
              borderColor: isCurrent ? colors.primary : 'transparent',
              borderWidth: 1,
            }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                {reached && <MaterialCommunityIcons name="star-four-points" size={10} color={colors.primary} />}
                <Text style={[evStyles.tierLabel, { color: reached ? colors.primary : colors.mutedForeground }]}>
                  {tier.label} ({tier.count}/{progress.total})
                </Text>
              </View>
              <Text style={[evStyles.tierEffects, { color: reached ? colors.foreground : colors.mutedForeground }]} numberOfLines={1}>
                {tier.effects.map(e =>
                  `${BONUS_LABELS[e.type] ?? e.type} ${e.type === 'qualityBonus' ? `+${e.value}` : `+${e.value}%`}`
                ).join('  ·  ')}
              </Text>
            </View>
          );
        })}

        <Text style={[evStyles.footnote, { color: colors.mutedForeground }]}>
          Combo exclusif — les bonus expirent à la fin de l'événement
        </Text>
      </LinearGradient>
    </View>
  );
}
const evStyles = StyleSheet.create({
  wrapper:      { marginHorizontal: 16, marginBottom: 12 },
  card:         { borderRadius: 16, padding: 14, borderWidth: 1.5 },
  headerRow:    { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  iconWrap:     { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  overline:     { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  name:         { fontSize: 16, fontWeight: '800', marginTop: 1 },
  timerBadge:   { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 10, borderWidth: 1 },
  timerText:    { fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  description:  { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  itemsRow:     { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  itemChip:     { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, borderWidth: 1 },
  itemChipText: { fontSize: 11, fontWeight: '600' },
  tierRow:      { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 5 },
  tierLabel:    { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  tierEffects:  { fontSize: 11 },
  footnote:     { fontSize: 10, fontStyle: 'italic', marginTop: 4, textAlign: 'center' },
});

function BonusSummaryPanel({
  game, colors,
}: {
  game: ReturnType<typeof useGame>;
  colors: ReturnType<typeof useColors>;
}) {
  const bonusTypes = ['orderGoldBonus', 'reputationBonus', 'qualityBonus', 'forgeXpBonus', 'dropBonus', 'craftSpeedBonus', 'marketValueBonus'];
  const active = bonusTypes.filter(t => game.getCollectionBonusTotal(t) > 0);
  if (active.length === 0) return null;
  return (
    <View style={[spStyles.panel, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 6 }}>
        <MaterialCommunityIcons name="lightning-bolt" size={16} color={colors.accent} />
        <Text style={[spStyles.title, { color: colors.foreground, marginBottom: 0 }]}>Bonus actifs des collections</Text>
      </View>
      <View style={spStyles.grid}>
        {active.map(t => {
          const val = game.getCollectionBonusTotal(t);
          return (
            <View key={t} style={[spStyles.chip, { backgroundColor: colors.card, borderColor: colors.primary + '44' }]}>
              <Text style={[spStyles.chipText, { color: colors.foreground }]}>
                {BONUS_LABELS[t]}{'\n'}
                <Text style={{ color: colors.primary, fontWeight: '800' }}>
                  {t === 'qualityBonus' ? `+${val}` : `+${val}%`}
                </Text>
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}
const spStyles = StyleSheet.create({
  panel:  { marginHorizontal: 16, marginBottom: 12, borderRadius: 14, padding: 14, borderWidth: 1 },
  title:  { fontSize: 13, fontWeight: '700', marginBottom: 10, letterSpacing: 0.5 },
  grid:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:   { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  chipText: { fontSize: 11, lineHeight: 16 },
});

function SetDetailModal({
  set, visible, onClose, game, colors,
}: {
  set: ItemSet | null;
  visible: boolean;
  onClose: () => void;
  game: ReturnType<typeof useGame>;
  colors: ReturnType<typeof useColors>;
}) {
  if (!set) return null;
  const progress = game.getCollectionProgress(set.id);
  const isComplete = progress.count === progress.total;
  const isClaimed  = game.completedSets.includes(set.id);
  const rc = RARITY_COLORS[set.rarity];

  const handleClaim = () => {
    const result = game.claimSetReward(set.id);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    onClose();
  };

  // Current active tier
  const activeTiers = set.bonuses.filter(b => progress.count >= b.count);
  const currentTier = activeTiers.length > 0 ? activeTiers[activeTiers.length - 1] : null;

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={mdStyles.overlay}>
        <View style={[mdStyles.sheet, { backgroundColor: colors.card, borderColor: rc + '88' }]}>
          <View style={[mdStyles.handle, { backgroundColor: colors.muted }]} />

          {/* Header */}
          <View style={mdStyles.headerRow}>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: rc + '22', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: rc + '55' }}>
              <MaterialCommunityIcons name={(set as any).icon ?? 'treasure-chest'} size={32} color={rc} />
            </View>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={[mdStyles.setName, { color: colors.foreground }]}>{set.name}</Text>
              <View style={[mdStyles.rarityBadge, { backgroundColor: rc + '22', borderColor: rc + '55' }]}>
                <Text style={[mdStyles.rarityText, { color: rc }]}>{RARITY_LABELS[set.rarity]}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <Text style={[mdStyles.description, { color: colors.mutedForeground }]}>{set.description}</Text>

          {/* Progress bar */}
          <View style={mdStyles.progressRow}>
            <Text style={[mdStyles.progressLabel, { color: colors.foreground }]}>
              {progress.count}/{progress.total} objets forgés
            </Text>
            <Text style={[mdStyles.progressLabel, { color: colors.mutedForeground }]}>
              {Math.round(progress.count / progress.total * 100)}%
            </Text>
          </View>
          <View style={[mdStyles.progressBar, { backgroundColor: colors.muted }]}>
            <View style={[mdStyles.progressFill, { width: `${(progress.count / progress.total) * 100}%` as `${number}%`, backgroundColor: rc }]} />
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
            {/* Items list */}
            <Text style={[mdStyles.sectionTitle, { color: colors.foreground }]}>Objets</Text>
            {set.items.map((recipeId) => {
              const crafted = progress.craftedIds.includes(recipeId);
              const isSecret = set.secret && !game.getCollectionProgress(set.id).craftedIds.length;
              return (
                <View key={recipeId} style={[mdStyles.itemRow, { backgroundColor: colors.secondary }]}>
                  <Feather name={crafted ? 'check-circle' : 'circle'} size={16} color={crafted ? '#4CAF50' : colors.mutedForeground} />
                  <Text style={[mdStyles.itemName, { color: crafted ? colors.foreground : colors.mutedForeground }]}>
                    {isSecret && !crafted ? '???' : recipeId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  </Text>
                </View>
              );
            })}

            {/* Bonus tiers */}
            <Text style={[mdStyles.sectionTitle, { color: colors.foreground }]}>Bonus</Text>
            {set.bonuses.map((tier) => {
              const reached = progress.count >= tier.count;
              const isCurrent = currentTier?.count === tier.count;
              return (
                <View key={tier.count} style={[
                  mdStyles.tierRow,
                  { backgroundColor: reached ? rc + '15' : colors.secondary, borderColor: isCurrent ? rc : 'transparent', borderWidth: isCurrent ? 1 : 0 },
                ]}>
                  <View style={mdStyles.tierHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      {reached && <MaterialCommunityIcons name="star-four-points" size={10} color={rc} />}
                      <Text style={[mdStyles.tierLabel, { color: reached ? rc : colors.mutedForeground }]}>
                        {tier.label} ({tier.count}/{set.items.length})
                      </Text>
                    </View>
                  </View>
                  {tier.effects.map((effect) => (
                    <Text key={effect.type} style={[mdStyles.effectText, { color: reached ? colors.foreground : colors.mutedForeground }]}>
                      {BONUS_LABELS[effect.type]}: {effect.type === 'qualityBonus' ? `+${effect.value}` : `+${effect.value}%`}
                    </Text>
                  ))}
                </View>
              );
            })}

            {/* Reward */}
            <View style={[mdStyles.rewardRow, { backgroundColor: isClaimed ? colors.muted : rc + '22', borderColor: rc + '55' }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <MaterialCommunityIcons name={isClaimed ? 'check-decagram' : 'gift'} size={18} color={isClaimed ? colors.mutedForeground : rc} />
                <Text style={[mdStyles.rewardTitle, { color: isClaimed ? colors.mutedForeground : rc, marginBottom: 0 }]}>
                  {isClaimed ? 'Récompense obtenue' : 'Récompense de collection'}
                </Text>
              </View>
              <Text style={[mdStyles.rewardText, { color: isClaimed ? colors.mutedForeground : colors.foreground }]}>
                {set.reward.gold.toLocaleString()} or  •  Titre : « {set.reward.title} »
              </Text>
              {isComplete && !isClaimed && (
                <TouchableOpacity style={[mdStyles.claimBtn, { backgroundColor: rc }]} onPress={handleClaim}>
                  <Text style={[mdStyles.claimBtnText, { color: '#fff' }]}>Réclamer la récompense</Text>
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
const mdStyles = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:       { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1.5, paddingBottom: 40 },
  handle:      { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  setName:     { fontSize: 20, fontWeight: '800' },
  rarityBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, marginTop: 4 },
  rarityText:  { fontSize: 11, fontWeight: '700' },
  description: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  progressLabel: { fontSize: 12, fontWeight: '600' },
  progressBar: { height: 6, borderRadius: 3, marginBottom: 14, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginTop: 12, marginBottom: 6, letterSpacing: 0.5 },
  itemRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, marginBottom: 4 },
  itemName:    { fontSize: 13 },
  tierRow:     { padding: 10, borderRadius: 10, marginBottom: 6 },
  tierHeader:  { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  tierLabel:   { fontSize: 12, fontWeight: '700' },
  effectText:  { fontSize: 12, marginLeft: 4, marginBottom: 2 },
  rewardRow:   { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
  rewardTitle: { fontSize: 13, fontWeight: '800', marginBottom: 4 },
  rewardText:  { fontSize: 13, marginBottom: 8 },
  claimBtn:    { paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  claimBtnText: { fontSize: 14, fontWeight: '800' },
});

function SetCard({
  set, game, colors, onPress,
}: {
  set: ItemSet;
  game: ReturnType<typeof useGame>;
  colors: ReturnType<typeof useColors>;
  onPress: () => void;
}) {
  const progress = game.getCollectionProgress(set.id);
  const rc = RARITY_COLORS[set.rarity];
  const isComplete = progress.count === progress.total;
  const isClaimed  = game.completedSets.includes(set.id);
  const anyFound   = progress.count > 0;
  const isRevealed = !set.secret || anyFound;

  // Active tier effects summary
  const activeTiers = set.bonuses.filter(b => progress.count >= b.count);
  const currentTier = activeTiers.length > 0 ? activeTiers[activeTiers.length - 1] : null;

  return (
    <Pressable
      style={[
        scStyles.card,
        {
          backgroundColor: colors.card,
          borderColor: isComplete ? rc : colors.border,
          borderWidth: isComplete ? 1.5 : 1,
        },
      ]}
      onPress={onPress}
    >
      {/* Emoji + Name */}
      <View style={scStyles.topRow}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: rc + '22', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: rc + '55' }}>
          <MaterialCommunityIcons name={isRevealed ? ((set as any).icon ?? 'treasure-chest') : 'lock'} size={24} color={isRevealed ? rc : colors.mutedForeground} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[scStyles.name, { color: colors.foreground }]} numberOfLines={1}>
            {isRevealed ? set.name : 'Collection Secrète'}
          </Text>
          <View style={[scStyles.rarityBadge, { backgroundColor: rc + '22' }]}>
            <Text style={[scStyles.rarityText, { color: rc }]}>{RARITY_LABELS[set.rarity]}</Text>
          </View>
        </View>
        {isComplete && <MaterialCommunityIcons name={isClaimed ? 'check-decagram' : 'gift'} size={24} color={isClaimed ? '#4CAF50' : '#E8B84B'} />}
      </View>

      {/* Progress */}
      <View style={scStyles.progressRow}>
        <View style={[scStyles.progressBar, { backgroundColor: colors.muted }]}>
          <View style={[scStyles.progressFill, {
            width: `${Math.round((progress.count / progress.total) * 100)}%` as `${number}%`,
            backgroundColor: rc,
          }]} />
        </View>
        <Text style={[scStyles.progressText, { color: colors.mutedForeground }]}>
          {progress.count}/{progress.total}
        </Text>
      </View>

      {/* Active bonus */}
      {currentTier && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <MaterialCommunityIcons name="star-four-points" size={10} color={rc} />
          <Text style={[scStyles.bonusText, { color: rc }]} numberOfLines={1}>
            {currentTier.label}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
const scStyles = StyleSheet.create({
  card:        { borderRadius: 14, padding: 14, marginBottom: 10 },
  topRow:      { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  name:        { fontSize: 14, fontWeight: '800' },
  rarityBadge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, marginTop: 3 },
  rarityText:  { fontSize: 10, fontWeight: '700' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  progressBar: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: 11, fontWeight: '600', minWidth: 28, textAlign: 'right' },
  bonusText:   { fontSize: 11, fontWeight: '700', marginTop: 2 },
});

function formatRecipeName(recipeId: string): string {
  return recipeId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function DiscoveredComboCard({
  combo, colors,
}: {
  combo: MicroCombo;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={[dcStyles.card, { backgroundColor: colors.card, borderColor: colors.accent + '66' }]}>
      <View style={dcStyles.topRow}>
        <View style={[dcStyles.iconWrap, { backgroundColor: colors.accent + '22', borderColor: colors.accent + '55' }]}>
          <MaterialCommunityIcons name={combo.icon as any} size={20} color={colors.accent} />
        </View>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[dcStyles.name, { color: colors.foreground }]} numberOfLines={1}>{combo.name}</Text>
          <Text style={[dcStyles.items, { color: colors.mutedForeground }]} numberOfLines={1}>
            {formatRecipeName(combo.items[0])} + {formatRecipeName(combo.items[1])}
          </Text>
        </View>
        <Text style={[dcStyles.bonus, { color: colors.accent }]}>
          {BONUS_LABELS[combo.bonus.type] ?? combo.bonus.type}{'\n'}
          <Text style={{ fontWeight: '800' }}>
            {combo.bonus.type === 'qualityBonus' ? `+${combo.bonus.value}` : `+${combo.bonus.value}%`}
          </Text>
        </Text>
      </View>
    </View>
  );
}

function DiscoveriesSection({
  colors, craftedIds,
}: {
  colors: ReturnType<typeof useColors>;
  craftedIds: Set<string>;
}) {
  const { discovered, partial, hiddenCount } = useMemo(() => {
    const discovered: MicroCombo[] = [];
    const partial: { combo: MicroCombo; knownId: string }[] = [];
    let hiddenCount = 0;
    for (const combo of ALL_MICRO_COMBOS) {
      const hasA = craftedIds.has(combo.items[0]);
      const hasB = craftedIds.has(combo.items[1]);
      if (hasA && hasB) discovered.push(combo);
      else if (hasA || hasB) partial.push({ combo, knownId: hasA ? combo.items[0] : combo.items[1] });
      else hiddenCount++;
    }
    return { discovered, partial, hiddenCount };
  }, [craftedIds]);

  return (
    <View style={dsStyles.section}>
      <View style={dsStyles.headerRow}>
        <MaterialCommunityIcons name="flask-outline" size={18} color={colors.accent} />
        <Text style={[dsStyles.title, { color: colors.foreground }]}>DÉCOUVERTES</Text>
        <Text style={[dsStyles.count, { color: colors.mutedForeground }]}>
          {discovered.length}/{ALL_MICRO_COMBOS.length}
        </Text>
      </View>
      <Text style={[dsStyles.subtitle, { color: colors.mutedForeground }]}>
        Forgez deux objets complémentaires pour révéler un combo unique et son bonus permanent.
      </Text>

      {discovered.map((combo) => (
        <DiscoveredComboCard key={combo.id} combo={combo} colors={colors} />
      ))}

      {/* Partially known combos: one of the two items forged — show a "??" teaser */}
      {partial.length > 0 && (
        <View style={dsStyles.partialGrid}>
          {partial.slice(0, 12).map(({ combo, knownId }) => (
            <View key={combo.id} style={[dsStyles.partialChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={[dsStyles.partialText, { color: colors.mutedForeground }]} numberOfLines={1}>
                {formatRecipeName(knownId)} + ??
              </Text>
            </View>
          ))}
          {partial.length > 12 && (
            <View style={[dsStyles.partialChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={[dsStyles.partialText, { color: colors.mutedForeground }]}>+{partial.length - 12} autres…</Text>
            </View>
          )}
        </View>
      )}

      {hiddenCount > 0 && (
        <Text style={[dsStyles.hiddenText, { color: colors.mutedForeground }]}>
          ?? — {hiddenCount} combo{hiddenCount > 1 ? 's' : ''} encore inconnu{hiddenCount > 1 ? 's' : ''}
        </Text>
      )}
    </View>
  );
}
const dcStyles = StyleSheet.create({
  card:     { borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1 },
  topRow:   { flexDirection: 'row', alignItems: 'center' },
  iconWrap: { width: 38, height: 38, borderRadius: 19, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  name:     { fontSize: 13, fontWeight: '800' },
  items:    { fontSize: 11, marginTop: 2 },
  bonus:    { fontSize: 10, fontWeight: '600', textAlign: 'right', lineHeight: 14 },
});
const dsStyles = StyleSheet.create({
  section:     { marginTop: 18 },
  headerRow:   { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  title:       { fontSize: 14, fontWeight: '900', letterSpacing: 2, flex: 1 },
  count:       { fontSize: 12, fontWeight: '700' },
  subtitle:    { fontSize: 11, lineHeight: 15, marginBottom: 10 },
  partialGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  partialChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9, borderWidth: 1, maxWidth: '48%' },
  partialText: { fontSize: 11, fontWeight: '600' },
  hiddenText:  { fontSize: 11, fontStyle: 'italic', marginTop: 10, textAlign: 'center' },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function CollectionsScreen() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const game    = useGame();

  const craftedIdsSet = useMemo(() => new Set(game.craftedRecipeIds), [game.craftedRecipeIds]);

  const [filter, setFilter]         = useState<typeof FILTERS[number]>('Tous');
  const [selectedSet, setSelectedSet] = useState<ItemSet | null>(null);

  const headerTopPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad    = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 80;

  // Summary stats
  const totalSets     = game.allCollections.length;
  const completedSets = game.allCollections.filter(s => game.getCollectionProgress(s.id).count === s.items.length).length;
  const inProgress    = game.allCollections.filter(s => {
    const p = game.getCollectionProgress(s.id);
    return p.count > 0 && p.count < p.total;
  }).length;

  // Filtered + sorted sets
  const filtered = useMemo(() => {
    const filterKey = FILTER_KEYS[filter];
    const sets = game.allCollections.filter(s => !filterKey || s.rarity === filterKey);
    // Sort: complete first, then in-progress, then locked; within each group by rarity
    const order = { mythic: 0, legendary: 1, epic: 2, rare: 3, common: 4 };
    return [...sets].sort((a, b) => {
      const pa = game.getCollectionProgress(a.id);
      const pb = game.getCollectionProgress(b.id);
      const statusA = pa.count === pa.total ? 0 : pa.count > 0 ? 1 : 2;
      const statusB = pb.count === pb.total ? 0 : pb.count > 0 ? 1 : 2;
      if (statusA !== statusB) return statusA - statusB;
      return (order[a.rarity] ?? 5) - (order[b.rarity] ?? 5);
    });
  }, [filter, game]);

  return (
    <View style={[csStyles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[csStyles.header, { paddingTop: headerTopPad + 10 }]}>
        <View>
          <Text style={[csStyles.title, { color: colors.foreground }]}>COLLECTIONS</Text>
          <Text style={[csStyles.subtitle, { color: colors.mutedForeground }]}>
            {completedSets}/{totalSets} complètes · {inProgress} en cours
          </Text>
        </View>
        <View style={[csStyles.trophyBadge, { backgroundColor: colors.primary + '22', borderWidth: 1, borderColor: colors.primary + '55' }]}>
          <MaterialCommunityIcons name="trophy" size={22} color={colors.primary} />
          <Text style={[csStyles.trophyText, { color: colors.primary }]}>{completedSets}</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={csStyles.filterScroll} contentContainerStyle={csStyles.filterContent}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[csStyles.filterTab, { backgroundColor: filter === f ? colors.primary : colors.secondary, borderColor: colors.border }]}
            onPress={() => setFilter(f)}
          >
            <Text style={[csStyles.filterText, { color: filter === f ? colors.primaryForeground : colors.mutedForeground }]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad }}>
        {/* Temporary event with exclusive combo */}
        <EventBanner game={game} colors={colors} />

        {/* Active bonus summary */}
        <BonusSummaryPanel game={game} colors={colors} />

        {/* Set cards */}
        {filtered.map((set, idx) => (
          <Animated.View key={set.id} entering={FadeInDown.delay(Math.min(idx * 40, 600)).springify()}>
            <SetCard
              set={set}
              game={game}
              colors={colors}
              onPress={() => setSelectedSet(set)}
            />
          </Animated.View>
        ))}

        {filtered.length === 0 && (
          <View style={csStyles.empty}>
            <MaterialCommunityIcons name="magnify" size={40} color={colors.mutedForeground} />
            <Text style={[csStyles.emptyText, { color: colors.mutedForeground }]}>Aucune collection pour ce filtre</Text>
          </View>
        )}

        {/* Procedurally generated micro-combos */}
        <DiscoveriesSection colors={colors} craftedIds={craftedIdsSet} />
      </ScrollView>

      {/* Detail modal */}
      <SetDetailModal
        set={selectedSet}
        visible={!!selectedSet}
        onClose={() => setSelectedSet(null)}
        game={game}
        colors={colors}
      />
    </View>
  );
}

const csStyles = StyleSheet.create({
  container:     { flex: 1 },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 18, paddingBottom: 12 },
  title:         { fontSize: 18, fontWeight: '900', letterSpacing: 3 },
  subtitle:      { fontSize: 12, fontWeight: '500', marginTop: 2 },
  trophyBadge:   { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14 },
  trophyText:    { fontSize: 16, fontWeight: '800' },
  filterScroll:  { maxHeight: 48, marginBottom: 12 },
  filterContent: { paddingHorizontal: 16, gap: 8, alignItems: 'center' },
  filterTab:     { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  filterText:    { fontSize: 13, fontWeight: '700' },
  empty:         { alignItems: 'center', paddingVertical: 60, gap: 12 },
  emptyText:     { fontSize: 14 },
});
