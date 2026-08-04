/**
 * Inventory screen — Resources tab + Crafted Items tab.
 * Features: search, category/quality filters, sort, weight capacity bar,
 * and ItemDetailSheet with 3D viewer + gem socketing.
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Feather from '@/components/Feather';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from '@/lib/LinearGradientSafe';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '@/context/GameContext';
import { useColors } from '@/hooks/useColors';
import type { CraftedGem, Item, ItemCategory, Quality, ResourceData } from '@/types/game';
import ItemDetailSheet from '@/components/ItemDetailSheet';
import AlloyWorkshop from '@/components/AlloyWorkshop';

// ─── Types ────────────────────────────────────────────────────────────────────
type TabType = 'resources' | 'items' | 'alloys' | 'showcase' | 'gems';
type SortOption = 'newest' | 'quality' | 'value' | 'name';
type CategoryFilter = 'all' | ItemCategory;
type QualityFilter = 'all' | Quality;

// ─── Helpers ─────────────────────────────────────────────────────────────────
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

function rarityColor(r: string, colors: ReturnType<typeof useColors>): string {
  switch (r) {
    case 'legendary': return '#9966CC';
    case 'epic': return '#7B42CC';
    case 'rare': return colors.accent;
    case 'uncommon': return colors.primary;
    default: return colors.mutedForeground;
  }
}

// ─── Icône par ressource ──────────────────────────────────────────────────────
const RESOURCE_ICONS: Record<string, React.ComponentProps<typeof Feather>['name']> = {
  // Métaux communs
  iron: 'tool',
  copper: 'droplet',
  bronze:       'shield',
  steel: 'scissors',
  silver: 'disc',
  gold_ore: 'dollar-sign',
  platinum: 'award',
  brass:        'tool',
  electrum: 'zap',
  // Métaux rares / magiques
  mithril: 'star',
  darksteel: 'alert-octagon',
  mithrilite:   'star',
  dragonite: 'activity',
  adamantium: 'shield',
  staralloy: 'star',
  // Minéraux
  stone: 'hexagon',
  obsidian: 'star',
  coal: 'activity',
  clay: 'droplet',
  // Gemmes
  crystal: 'globe',
  ruby: 'hexagon',
  sapphire: 'hexagon',
  emerald: 'hexagon',
  diamond: 'hexagon',
  topaz:        'octagon',
  amethyst:     'square',
  onyx: 'grid',
  // Organique
  wood: 'feather',
  dragon_scale: 'alert-octagon',
};

function ResourceIcon({ id, color, size = 20 }: { id: string; color: string; size?: number }) {
  const icon = RESOURCE_ICONS[id] ?? 'box';
  return <Feather name={icon} size={size} color={color} />;
}

const CATEGORY_LABELS: Record<string, string> = {
  all: 'Tout', sword: 'Épées', axe: 'Haches', hammer: 'Marteaux',
  lance: 'Lances', shield: 'Boucliers', armor: 'Armures', helmet: 'Casques',
  ring: 'Anneaux', amulet: 'Amulettes', tool: 'Outils', decoration: 'Déco',
};
const QUALITY_FILTER_LABELS: Record<string, string> = {
  all: 'Toutes', poor: 'Médiocre', normal: 'Normal',
  good: 'Bon', excellent: 'Excellent', legendary: 'Légendaire',
};
const SORT_LABELS: Record<SortOption, string> = {
  newest: 'Récent', quality: 'Qualité', value: 'Valeur', name: 'Nom',
};
const QUALITY_ORDER: Record<Quality, number> = {
  legendary: 5, excellent: 4, good: 3, normal: 2, poor: 1,
};
const ALL_CATEGORIES: CategoryFilter[] = [
  'all', 'sword', 'axe', 'hammer', 'lance', 'shield', 'armor',
  'helmet', 'ring', 'amulet', 'tool', 'decoration',
];

// ─── Weight bar ───────────────────────────────────────────────────────────────
function WeightBar({
  current,
  max,
  colors,
}: { current: number; max: number; colors: ReturnType<typeof useColors> }) {
  const pct = Math.min(1, current / max);
  const barColor = pct > 0.9 ? colors.destructive : pct > 0.7 ? colors.primary : colors.accent;
  return (
    <View style={weightStyles.container}>
      <Feather name="activity" size={14} color={pct > 0.7 ? barColor : colors.mutedForeground} />
      <View style={[weightStyles.track, { backgroundColor: colors.muted }]}>
        <View style={[weightStyles.fill, { width: `${Math.round(pct * 100)}%` as `${number}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={[weightStyles.label, { color: pct > 0.7 ? barColor : colors.mutedForeground }]}>
        {current.toFixed(1)}/{max}kg
      </Text>
    </View>
  );
}
const weightStyles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  track: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, minWidth: 3 },
  label: { fontSize: 11, fontWeight: '700', minWidth: 80, textAlign: 'right' },
});

// ─── Resource card ────────────────────────────────────────────────────────────
function ResourceCard({
  res,
  qty,
  colors,
  index,
}: { res: ResourceData; qty: number; colors: ReturnType<typeof useColors>; index: number }) {
  const isGem = res.type === 'gem';
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index * 30, 400)).springify()}>
      <LinearGradient
        colors={['rgba(30,25,20,0.9)', 'rgba(15,12,10,0.95)']}
        style={[
          styles.resourceCard,
          {
            borderColor: isGem ? res.color + '80' : 'rgba(200,140,60,0.3)',
            borderWidth: isGem ? 1.5 : 1,
          },
        ]}
      >
        {/* Color strip */}
        <View style={[styles.resourceStrip, { backgroundColor: res.color }]} />
        <View style={styles.resourceBody}>
          <View style={styles.resourceTop}>
            <View style={styles.resourceIcon}>
              <ResourceIcon id={res.id} color={res.color} size={20} />
            </View>
          <View style={styles.resourceNameRow}>
            <Text style={[styles.resourceName, { color: colors.foreground }]}>{res.name}</Text>
            {isGem && (
              <Text style={[styles.gemBadge, { color: res.color }]}>GEM</Text>
            )}
          </View>
          <View style={[styles.qtyBadge, { backgroundColor: isGem ? res.color + '28' : colors.secondary }]}>
            <Text style={[styles.qtyText, { color: isGem ? res.color : colors.accent }]}>×{qty}</Text>
          </View>
        </View>
        <View style={styles.resourceMeta}>
          <Text style={[styles.resourceMetaText, { color: rarityColor(res.rarity, colors) }]}>
            {res.rarity}
          </Text>
          <Text style={[styles.resourceMetaText, { color: colors.mutedForeground }]}>
            · Niv.{res.level}
          </Text>
          <Text style={[styles.resourceMetaText, { color: colors.mutedForeground }]}>
            · {res.weight}kg
          </Text>
          <Text style={[styles.resourceMetaText, { color: colors.mutedForeground }]}>
            · pureté {res.purity}%
          </Text>
        </View>
      </View>
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Crafted item card ────────────────────────────────────────────────────────
function CraftedItemCard({
  item,
  onPress,
  colors,
  index,
}: { item: Item; onPress: () => void; colors: ReturnType<typeof useColors>; index: number }) {
  const qc = qualityColor(item.quality, colors);
  const gemsSlotted = item.gems.filter(Boolean).length;
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index * 30, 400)).springify()}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
      >
        <LinearGradient
          colors={['rgba(30,25,20,0.9)', 'rgba(15,12,10,0.95)']}
          style={[styles.itemCard, { borderColor: item.enigmaMastered ? '#C084FC' : qc, borderWidth: item.enigmaMastered ? 1.5 : 1 }]}
        >
          <View style={[styles.itemQualityStrip, { backgroundColor: qc }]} />
          {/* Enigma mastery badge — top-right corner overlay */}
          {item.enigmaMastered && (
            <View style={styles.enigmaBadge}>
              <Feather name="star" size={10} color="#C084FC" />
              <Text style={styles.enigmaBadgeText}>Maîtrise</Text>
            </View>
          )}
      <View style={styles.itemBody}>
        <View style={styles.itemTop}>
          <View style={styles.itemInfo}>
            <Text style={[styles.itemCategory, { color: qc }]}>
              {qualityLabel(item.quality)}
            </Text>
            <Text style={[styles.itemName, { color: colors.foreground }]}>{item.name}</Text>
            <Text style={[styles.itemMeta, { color: colors.mutedForeground }]}>
              {item.category} · Niv.{item.level}
            </Text>
          </View>
          <View style={styles.itemRight}>
            <Text style={[styles.itemValue, { color: colors.accent }]}>{item.value}g</Text>
            {item.gemSlots > 0 && (
              <View style={styles.gemRow}>
                {Array.from({ length: item.gemSlots }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.miniGem,
                      {
                        backgroundColor: item.gems[i]
                          ? (item.gems[i] as NonNullable<typeof item.gems[0]>).color
                          : colors.muted,
                      },
                    ]}
                  />
                ))}
              </View>
            )}
            <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
          </View>
        </View>
        {/* Stat row */}
        <View style={styles.statPills}>
          {item.stats.attack !== undefined && (
            <View style={[styles.statPill, { backgroundColor: colors.secondary }]}>
              <Feather name="scissors" size={12} color={colors.accent} style={{ marginRight: 4 }} />
              <Text style={[styles.statPillText, { color: colors.accent }]}>{item.stats.attack}</Text>
            </View>
          )}
          {item.stats.defense !== undefined && (
            <View style={[styles.statPill, { backgroundColor: colors.secondary }]}>
              <Feather name="shield" size={12} color={colors.accent} style={{ marginRight: 4 }} />
              <Text style={[styles.statPillText, { color: colors.accent }]}>{item.stats.defense}</Text>
            </View>
          )}
          {item.stats.magic !== undefined && (
            <View style={[styles.statPill, { backgroundColor: colors.secondary }]}>
              <Feather name="edit-3" size={12} color={colors.accent} style={{ marginRight: 4 }} />
              <Text style={[styles.statPillText, { color: colors.accent }]}>{item.stats.magic}</Text>
            </View>
          )}
          {item.stats.speed !== undefined && (
            <View style={[styles.statPill, { backgroundColor: colors.secondary }]}>
              <Feather name="zap" size={12} color={colors.accent} style={{ marginRight: 4 }} />
              <Text style={[styles.statPillText, { color: colors.accent }]}>{item.stats.speed}</Text>
            </View>
          )}
          {gemsSlotted > 0 && (
            <View style={[styles.statPill, { backgroundColor: colors.secondary }]}>
              <Feather name="hexagon" size={12} color="#9966CC" style={{ marginRight: 4 }} />
              <Text style={[styles.statPillText, { color: '#9966CC' }]}>×{gemsSlotted}</Text>
            </View>
          )}
        </View>
      </View>
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ─── Showcase Vitrine ─────────────────────────────────────────────────────────
const MAX_SHOWCASE_SLOTS = 6;

function showcaseQualityColor(q: Quality, colors: ReturnType<typeof useColors>): string {
  switch (q) {
    case 'legendary': return '#9966CC';
    case 'excellent': return colors.accent;
    case 'good': return colors.primary;
    case 'normal': return colors.foreground;
    case 'poor': return colors.mutedForeground;
  }
}

function ShowcaseItemCard({ item, onPress, colors }: {
  item: Item;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const qc = showcaseQualityColor(item.quality, colors);
  const craftDate = new Date(item.craftedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: '2-digit' });
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={scStyles.slotWrapper}>
      <View style={[scStyles.filledSlot, { backgroundColor: colors.secondary, borderColor: qc }]}>
        <View style={[scStyles.qualityStrip, { backgroundColor: qc }]} />
        <View style={scStyles.slotBody}>
          {/* Quality label */}
          <Text style={[scStyles.qualityLabel, { color: qc }]}>{qualityLabel(item.quality)}</Text>
          {/* Name + epithet */}
          <Text style={[scStyles.itemName, { color: colors.foreground }]} numberOfLines={2}>{item.name}</Text>
          {item.unique?.epithet ? (
            <Text style={[scStyles.epithet, { color: '#E8B84B' }]} numberOfLines={1}>
              « {item.unique.epithet} »
            </Text>
          ) : null}
          {/* Category */}
          <Text style={[scStyles.meta, { color: colors.mutedForeground }]}>{item.category} · Niv.{item.level}</Text>
          {/* Stats */}
          <View style={scStyles.statRow}>
            {item.stats.attack !== undefined && (
              <View style={[scStyles.statChip, { backgroundColor: colors.card }]}>
                <Feather name="scissors" size={10} color={colors.accent} />
                <Text style={[scStyles.statText, { color: colors.accent }]}>{item.stats.attack}</Text>
              </View>
            )}
            {item.stats.defense !== undefined && (
              <View style={[scStyles.statChip, { backgroundColor: colors.card }]}>
                <Feather name="shield" size={10} color={colors.accent} />
                <Text style={[scStyles.statText, { color: colors.accent }]}>{item.stats.defense}</Text>
              </View>
            )}
            {item.stats.magic !== undefined && (
              <View style={[scStyles.statChip, { backgroundColor: colors.card }]}>
                <Feather name="edit-3" size={10} color={colors.accent} />
                <Text style={[scStyles.statText, { color: colors.accent }]}>{item.stats.magic}</Text>
              </View>
            )}
          </View>
          {/* Badges */}
          <View style={scStyles.badgeRow}>
            {item.enigmaMastered && (
              <View style={[scStyles.badge, { backgroundColor: '#5C00AA30', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                <Feather name="droplet" size={11} color="#C084FC" />
                <Text style={[scStyles.badgeText, { color: '#C084FC' }]}>Énigme</Text>
              </View>
            )}
            {item.unique && (
              <View style={[scStyles.badge, { backgroundColor: '#E8B84B20', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                <Feather name="star" size={11} color="#E8B84B" />
                <Text style={[scStyles.badgeText, { color: '#E8B84B' }]}>Unique</Text>
              </View>
            )}
          </View>
          {/* Forge stamp */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Feather name="tool" size={11} color={colors.mutedForeground} />
            <Text style={[scStyles.stamp, { color: colors.mutedForeground }]}>{item.craftedBy} · {craftDate}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function EmptyShowcaseSlot({ onPress, colors }: { onPress: () => void; colors: ReturnType<typeof useColors> }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={scStyles.slotWrapper}>
      <View style={[scStyles.emptySlot, { borderColor: colors.border }]}>
        <Feather name="plus-circle" size={28} color={colors.mutedForeground} />
        <Text style={[scStyles.emptySlotText, { color: colors.mutedForeground }]}>Épingler{'\n'}un objet</Text>
      </View>
    </TouchableOpacity>
  );
}

function ShowcaseSection({ game, colors, bottomPad }: {
  game: ReturnType<typeof useGame>;
  colors: ReturnType<typeof useColors>;
  bottomPad: number;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const showcasedItems = useMemo(() =>
    game.showcasedItemIds
      .map((id) => game.craftedItems.find((i) => i.instanceId === id))
      .filter(Boolean) as Item[],
    [game.showcasedItemIds, game.craftedItems],
  );

  const pickableItems = useMemo(() => {
    const pinned = new Set(game.showcasedItemIds);
    return [...game.craftedItems]
      .filter((i) => !pinned.has(i.instanceId))
      .sort((a, b) => {
        const qd = QUALITY_ORDER[b.quality] - QUALITY_ORDER[a.quality];
        return qd !== 0 ? qd : b.value - a.value;
      });
  }, [game.craftedItems, game.showcasedItemIds]);

  const detailItem = detailId ? showcasedItems.find((i) => i.instanceId === detailId) ?? null : null;
  const slots = Array.from({ length: MAX_SHOWCASE_SLOTS }, (_, i) => showcasedItems[i] ?? null);
  const canAdd = showcasedItems.length < MAX_SHOWCASE_SLOTS;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[scStyles.container, { paddingBottom: bottomPad }]}
      showsVerticalScrollIndicator={false}
      >
      {/* Header */}
      <View style={scStyles.sectionHeader}>
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Feather name="star" size={14} color={colors.foreground} />
            <Text style={[scStyles.sectionTitle, { color: colors.foreground }]}>VOTRE VITRINE</Text>
          </View>
          <Text style={[scStyles.sectionSub, { color: colors.mutedForeground }]}>
            {showcasedItems.length}/{MAX_SHOWCASE_SLOTS} pièces exposées
          </Text>
        </View>
        {showcasedItems.length === 0 && (
          <Text style={[scStyles.hintText, { color: colors.mutedForeground }]}>
            Épinglez vos plus belles créations pour les mettre en valeur.
          </Text>
        )}
      </View>

      {/* 2-column grid */}
      <View style={scStyles.grid}>
        {slots.map((item, i) =>
          item ? (
            <ShowcaseItemCard key={item.instanceId} item={item} colors={colors} onPress={() => setDetailId(item.instanceId)} />
          ) : (
            <EmptyShowcaseSlot key={`empty-${i}`} colors={colors} onPress={() => canAdd && setPickerOpen(true)} />
          )
        )}
      </View>

      {/* ── Detail modal ── */}
      <Modal visible={!!detailItem} transparent animationType="slide" onRequestClose={() => setDetailId(null)}>
        <View style={[scStyles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.88)' }]}>
          <View style={[scStyles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[scStyles.handle, { backgroundColor: colors.muted }]} />
            {detailItem && (() => {
              const qc = showcaseQualityColor(detailItem.quality, colors);
              const craftDate = new Date(detailItem.craftedAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={[scStyles.detailQualityBar, { backgroundColor: qc }]} />
                  <View style={scStyles.detailBody}>
                    <Text style={[scStyles.detailQualityLabel, { color: qc }]}>{qualityLabel(detailItem.quality)}</Text>
                    <Text style={[scStyles.detailName, { color: colors.foreground }]}>{detailItem.name}</Text>
                    {detailItem.unique?.epithet && (
                      <Text style={[scStyles.detailEpithet, { color: '#E8B84B' }]}>« {detailItem.unique.epithet} »</Text>
                    )}
                    <Text style={[scStyles.detailMeta, { color: colors.mutedForeground }]}>
                      {detailItem.category} · Niveau {detailItem.level} · {detailItem.value}g
                    </Text>

                    {/* Unique traits */}
                    {detailItem.unique && (
                      <View style={scStyles.traitsBox}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                          <Feather name="star" size={13} color={colors.accent} />
                          <Text style={[scStyles.traitTitle, { color: colors.accent }]}>TRAITS UNIQUES</Text>
                        </View>
                        {[
                          { label: 'Forme', val: detailItem.unique.form },
                          { label: 'Monture', val: detailItem.unique.fitting },
                          { label: 'Prise', val: detailItem.unique.grip },
                          { label: 'Gravure', val: detailItem.unique.engraving },
                          { label: 'Teinte', val: detailItem.unique.steelTint },
                        ].map(({ label, val }) => val ? (
                          <View key={label} style={scStyles.traitRow}>
                            <Text style={[scStyles.traitLabel, { color: colors.mutedForeground }]}>{label}</Text>
                            <Text style={[scStyles.traitVal, { color: colors.foreground }]}>{val}</Text>
                          </View>
                        ) : null)}
                      </View>
                    )}

                    {/* Stats */}
                    <View style={scStyles.statsGrid}>
                      {detailItem.stats.attack !== undefined && <View style={[scStyles.statCard, { backgroundColor: colors.secondary }]}><Feather name="scissors" size={16} color={colors.accent} /><Text style={[scStyles.statCardVal, { color: colors.accent }]}>{detailItem.stats.attack}</Text><Text style={[scStyles.statCardLabel, { color: colors.mutedForeground }]}>ATQ</Text></View>}
                      {detailItem.stats.defense !== undefined && <View style={[scStyles.statCard, { backgroundColor: colors.secondary }]}><Feather name="shield" size={16} color={colors.accent} /><Text style={[scStyles.statCardVal, { color: colors.accent }]}>{detailItem.stats.defense}</Text><Text style={[scStyles.statCardLabel, { color: colors.mutedForeground }]}>DEF</Text></View>}
                      {detailItem.stats.magic !== undefined && <View style={[scStyles.statCard, { backgroundColor: colors.secondary }]}><Feather name="edit-3" size={16} color={colors.accent} /><Text style={[scStyles.statCardVal, { color: colors.accent }]}>{detailItem.stats.magic}</Text><Text style={[scStyles.statCardLabel, { color: colors.mutedForeground }]}>MAG</Text></View>}
                      {detailItem.stats.speed !== undefined && <View style={[scStyles.statCard, { backgroundColor: colors.secondary }]}><Feather name="zap" size={16} color={colors.accent} /><Text style={[scStyles.statCardVal, { color: colors.accent }]}>{detailItem.stats.speed}</Text><Text style={[scStyles.statCardLabel, { color: colors.mutedForeground }]}>VIT</Text></View>}
                    </View>

                    {/* Badges */}
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                      {detailItem.enigmaMastered && <View style={[scStyles.badge, { backgroundColor: '#5C00AA30', flexDirection: 'row', alignItems: 'center', gap: 4 }]}><Feather name="droplet" size={11} color="#C084FC" /><Text style={[scStyles.badgeText, { color: '#C084FC' }]}>Défi d'énigme réussi</Text></View>}
                      {detailItem.unique && <View style={[scStyles.badge, { backgroundColor: '#E8B84B20', flexDirection: 'row', alignItems: 'center', gap: 4 }]}><Feather name="star" size={11} color="#E8B84B" /><Text style={[scStyles.badgeText, { color: '#E8B84B' }]}>Arme unique</Text></View>}
                    </View>

                    {/* Forge stamp */}
                    <View style={[scStyles.stampBox, { backgroundColor: colors.secondary }]}>
                      <Text style={[scStyles.stampLabel, { color: colors.mutedForeground }]}>EMPREINTE DE FORGE</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Feather name="tool" size={12} color={colors.foreground} />
                        <Text style={[scStyles.stampText, { color: colors.foreground }]}>Forgé par {detailItem.craftedBy}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Feather name="calendar" size={12} color={colors.mutedForeground} />
                        <Text style={[scStyles.stampText, { color: colors.mutedForeground }]}>{craftDate}</Text>
                      </View>
                    </View>

                    {/* Unpin button */}
                    <TouchableOpacity
                      style={[scStyles.unpinBtn, { borderColor: '#F44336' }]}
                      onPress={() => { game.unpinFromShowcase(detailItem.instanceId); setDetailId(null); }}
                    >
                      <Feather name="x" size={14} color="#F44336" />
                      <Text style={[scStyles.unpinBtnText, { color: '#F44336' }]}>Retirer de la vitrine</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={scStyles.closeBtn} onPress={() => setDetailId(null)}>
                      <Text style={[scStyles.closeBtnText, { color: colors.mutedForeground }]}>Fermer</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              );
            })()}
          </View>
        </View>
      </Modal>

      </ScrollView>

      {/* ── Item picker modal ── */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <View style={[scStyles.modalOverlay, { backgroundColor: 'rgba(0,0,0,0.88)' }]}>
          <View style={[scStyles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[scStyles.handle, { backgroundColor: colors.muted }]} />
            <View style={scStyles.pickerHeader}>
              <Text style={[scStyles.pickerTitle, { color: colors.foreground }]}>Choisir un objet</Text>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Fermer le sélecteur d'objet"
                testID="showcase-picker-close-icon"
                onPress={() => setPickerOpen(false)}
              >
                <Feather name="x" size={22} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
            {pickableItems.length === 0 ? (
              <View style={[scStyles.emptyPicker, { backgroundColor: colors.secondary }]}>
                <Feather name="tool" size={36} color={colors.mutedForeground} />
                <Text style={[scStyles.emptyPickerText, { color: colors.mutedForeground }]}>
                  Forgez des objets pour les exposer dans votre vitrine.
                </Text>
              </View>
            ) : (
              <FlatList
                data={pickableItems}
                keyExtractor={(i) => i.instanceId}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}
                renderItem={({ item }) => {
                  const qc = showcaseQualityColor(item.quality, colors);
                  return (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={[scStyles.pickerRow, { backgroundColor: colors.secondary, borderColor: qc }]}
                      onPress={() => { game.pinToShowcase(item.instanceId); setPickerOpen(false); }}
                    >
                      <View style={[scStyles.pickerStrip, { backgroundColor: qc }]} />
                      <View style={{ flex: 1, paddingHorizontal: 10, paddingVertical: 8 }}>
                        <Text style={[scStyles.pickerQuality, { color: qc }]}>{qualityLabel(item.quality)}</Text>
                        <Text style={[scStyles.pickerName, { color: colors.foreground }]}>{item.name}</Text>
                        {item.unique?.epithet && <Text style={[scStyles.pickerEpithet, { color: '#E8B84B' }]}>« {item.unique.epithet} »</Text>}
                        <Text style={[scStyles.pickerMeta, { color: colors.mutedForeground }]}>{item.category} · {item.value}g</Text>
                      </View>
                      <Feather name="plus" size={18} color={qc} style={{ paddingRight: 12 }} />
                    </TouchableOpacity>
                  );
                }}
              />
            )}
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Fermer le sélecteur d'objet"
              testID="showcase-picker-close"
              style={[scStyles.pickerCloseButton, { borderColor: colors.border }]}
              onPress={() => setPickerOpen(false)}
            >
              <Text style={[scStyles.pickerCloseButtonText, { color: colors.mutedForeground }]}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const scStyles = StyleSheet.create({
  container: { padding: 16 },
  sectionHeader: { marginBottom: 18 },
  sectionTitle: { fontSize: 16, fontWeight: '800', letterSpacing: 3, marginBottom: 3 },
  sectionSub: { fontSize: 12, fontWeight: '500' },
  hintText: { fontSize: 12, marginTop: 8, lineHeight: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  slotWrapper: { width: '48%' },
  // Filled slot
  filledSlot: { borderRadius: 14, borderWidth: 2, flexDirection: 'row', overflow: 'hidden', minHeight: 180 },
  qualityStrip: { width: 5 },
  slotBody: { flex: 1, padding: 10, gap: 3 },
  qualityLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  itemName: { fontSize: 13, fontWeight: '700', lineHeight: 17 },
  epithet: { fontSize: 11, fontStyle: 'italic' },
  meta: { fontSize: 10, marginTop: 2 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  statChip: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  statText: { fontSize: 10, fontWeight: '700' },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 3 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  badgeText: { fontSize: 9, fontWeight: '700' },
  stamp: { fontSize: 9, marginTop: 4, lineHeight: 13 },
  // Empty slot
  emptySlot: { borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', height: 160, alignItems: 'center', justifyContent: 'center', gap: 8 },
  emptySlotText: { fontSize: 11, textAlign: 'center', lineHeight: 16 },
  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { maxHeight: '87%', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 6 },
  detailQualityBar: { height: 4 },
  detailBody: { padding: 20 },
  detailQualityLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  detailName: { fontSize: 22, fontWeight: '800', marginBottom: 4 },
  detailEpithet: { fontSize: 15, fontStyle: 'italic', marginBottom: 6 },
  detailMeta: { fontSize: 12, marginBottom: 14 },
  traitsBox: { borderRadius: 12, padding: 14, marginBottom: 14 },
  traitTitle: { fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  traitRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  traitLabel: { fontSize: 12 },
  traitVal: { fontSize: 12, fontWeight: '600' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  statCard: { flex: 1, minWidth: 60, borderRadius: 12, padding: 10, alignItems: 'center', gap: 2 },
  statCardVal: { fontSize: 18, fontWeight: '800' },
  statCardLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  stampBox: { borderRadius: 12, padding: 14, gap: 4, marginBottom: 16 },
  stampLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 2, marginBottom: 4 },
  stampText: { fontSize: 13 },
  unpinBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  unpinBtnText: { fontSize: 14, fontWeight: '700' },
  closeBtn: { paddingVertical: 10, alignItems: 'center' },
  closeBtnText: { fontSize: 14 },
  // Picker
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 14 },
  pickerTitle: { fontSize: 17, fontWeight: '700' },
  pickerRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1.5, marginBottom: 8, overflow: 'hidden' },
  pickerStrip: { width: 5, alignSelf: 'stretch' },
  pickerQuality: { fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  pickerName: { fontSize: 14, fontWeight: '700', marginVertical: 2 },
  pickerEpithet: { fontSize: 11, fontStyle: 'italic', marginBottom: 2 },
  pickerMeta: { fontSize: 11 },
  emptyPicker: { margin: 20, borderRadius: 14, padding: 30, alignItems: 'center', gap: 10 },
  emptyPickerText: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  pickerCloseButton: { alignItems: 'center', borderTopWidth: 1, paddingVertical: 15 },
  pickerCloseButtonText: { fontSize: 14, fontWeight: '700' },
});

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function InventoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const game = useGame();

  const [activeTab, setActiveTab] = useState<TabType>('resources');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  // Store instanceId, not a snapshot — ItemDetailSheet derives live item from context
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const headerTopPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 96;

  // ── Compute total weight (resources + items) ──
  const currentWeight = useMemo(() => {
    const rw = game.inventory.reduce((acc, inv) => {
      const res = game.getResourceById(inv.resourceId);
      return acc + (res?.weight ?? 0) * inv.quantity;
    }, 0);
    const iw = game.craftedItems.reduce((a, b) => a + b.weight, 0);
    return Math.round((rw + iw) * 10) / 10;
  }, [game.inventory, game.craftedItems, game.getResourceById]);

  // ── Filtered/sorted resources ──
  const filteredResources = useMemo(() => {
    let list = game.inventory
      .map((inv) => ({ inv, res: game.getResourceById(inv.resourceId) }))
      .filter((x) => !!x.res);

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((x) => x.res!.name.toLowerCase().includes(q));
    }
    // Sort gems first, then by name
    list.sort((a, b) => {
      if (a.res!.type === 'gem' && b.res!.type !== 'gem') return -1;
      if (b.res!.type === 'gem' && a.res!.type !== 'gem') return 1;
      return a.res!.name.localeCompare(b.res!.name);
    });
    return list;
  }, [game.inventory, search, game.getResourceById]);

  // ── Filtered/sorted crafted items ──
  const filteredItems = useMemo(() => {
    let list = [...game.craftedItems];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((i) => i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
    }
    if (categoryFilter !== 'all') {
      list = list.filter((i) => i.category === categoryFilter);
    }
    if (qualityFilter !== 'all') {
      list = list.filter((i) => i.quality === qualityFilter);
    }
    switch (sortBy) {
      case 'newest': list.sort((a, b) => b.craftedAt - a.craftedAt); break;
      case 'quality': list.sort((a, b) => QUALITY_ORDER[b.quality] - QUALITY_ORDER[a.quality]); break;
      case 'value': list.sort((a, b) => b.value - a.value); break;
      case 'name': list.sort((a, b) => a.name.localeCompare(b.name)); break;
    }
    return list;
  }, [game.craftedItems, search, categoryFilter, qualityFilter, sortBy]);

  const weightPct = game.maxWeight > 0 ? currentWeight / game.maxWeight : 0;

  if (!game.isLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <LinearGradient
        colors={[colors.card as string, 'transparent']}
        style={[styles.header, { paddingTop: headerTopPad + 10 }]}
      >
        <View style={styles.headerRow}>
          <View style={styles.headerLeft}>
            <Feather name="archive" size={20} color={colors.primary} />
            <View>
              <Text style={[styles.headerTitle, { color: colors.foreground }]}>INVENTAIRE</Text>
              {game.player.forgeName ? (
                <Text style={[styles.headerForgeName, { color: colors.mutedForeground }]} numberOfLines={1}>
                  {game.player.forgeName}
                </Text>
              ) : null}
            </View>
          </View>
          <WeightBar current={currentWeight} max={game.maxWeight} colors={colors} />
        </View>
        {weightPct > 0.8 && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 }}>
            <Feather name="alert-circle" size={14} color={colors.destructive} style={{ marginRight: 4 }} />
            <Text style={[styles.weightWarning, { color: colors.destructive, marginTop: 0 }]}>
              Inventaire presque plein !
            </Text>
          </View>
        )}
      </LinearGradient>

      {/* ── Tab bar ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabBar, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.tabBarContent}
      >
        {([
          { key: 'resources', label: 'Ressources', icon: 'tool',        badge: game.inventory.length },
          { key: 'items',     label: 'Objets',     icon: 'shield',    badge: game.craftedItems.length },
          { key: 'alloys',    label: 'Alliages',   icon: 'activity',            badge: game.discoveredAlloyIds.length },
          { key: 'showcase',  label: 'Vitrine',    icon: 'award',  badge: game.showcasedItemIds.length },
          { key: 'gems',      label: 'Gemmes',     icon: 'hexagon',   badge: game.craftedGems?.length ?? 0 },
        ] as { key: TabType; label: string; icon: string; badge: number }[]).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key
                ? { borderBottomColor: colors.primary, borderBottomWidth: 2, backgroundColor: colors.primary + '18' }
                : { borderBottomWidth: 2, borderBottomColor: 'transparent' },
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Feather
              name={tab.icon as any}
              size={16}
              color={activeTab === tab.key ? colors.primary : colors.mutedForeground}
            />
            <Text style={[styles.tabText, { color: activeTab === tab.key ? colors.primary : colors.mutedForeground }]}>
              {tab.label}
            </Text>
            {tab.badge > 0 && (
              <View style={[styles.tabBadge, { backgroundColor: activeTab === tab.key ? colors.primary : colors.muted }]}>
                <Text style={[styles.tabBadgeText, { color: activeTab === tab.key ? colors.primaryForeground : colors.mutedForeground }]}>
                  {tab.badge}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Search + filter row (only for resources / items) ── */}
      {activeTab !== 'alloys' && activeTab !== 'showcase' && activeTab !== 'gems' && <View style={[styles.toolbarRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Feather name="search" size={14} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground }]}
            placeholder="Rechercher…"
            placeholderTextColor={colors.mutedForeground}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Feather name="x" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
          )}
        </View>
        {activeTab === 'items' && (
          <TouchableOpacity
            style={[styles.filterToggle, { backgroundColor: showFilters ? colors.primary : colors.secondary }]}
            onPress={() => setShowFilters((v) => !v)}
          >
            <Feather name="sliders" size={15} color={showFilters ? colors.primaryForeground : colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>}

      {/* ── Filter panel (items only) ── */}
      {activeTab === 'items' && showFilters && (
        <View style={[styles.filterPanel, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          {/* Category */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow} contentContainerStyle={{ gap: 6 }}>
            {ALL_CATEGORIES.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor: categoryFilter === cat ? colors.primary : colors.secondary,
                    borderColor: categoryFilter === cat ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => setCategoryFilter(cat)}
              >
                <Text style={[styles.filterChipText, { color: categoryFilter === cat ? colors.primaryForeground : colors.mutedForeground }]}>
                  {CATEGORY_LABELS[cat]}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {/* Quality + Sort row */}
          <View style={styles.filterSecondRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, flex: 1 }}>
              {(Object.keys(QUALITY_FILTER_LABELS) as QualityFilter[]).map((qf) => (
                <TouchableOpacity
                  key={qf}
                  style={[
                    styles.filterChip,
                    { backgroundColor: qualityFilter === qf ? colors.accent : colors.secondary, borderColor: qualityFilter === qf ? colors.accent : colors.border },
                  ]}
                  onPress={() => setQualityFilter(qf)}
                >
                  <Text style={[styles.filterChipText, { color: qualityFilter === qf ? colors.card : colors.mutedForeground }]}>
                    {QUALITY_FILTER_LABELS[qf]}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {/* Sort */}
            <View style={[styles.sortRow]}>
              {(Object.keys(SORT_LABELS) as SortOption[]).map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[
                    styles.sortChip,
                    { backgroundColor: sortBy === s ? colors.secondary : 'transparent', borderColor: sortBy === s ? colors.border : 'transparent' },
                  ]}
                  onPress={() => setSortBy(s)}
                >
                  <Text style={[styles.sortChipText, { color: sortBy === s ? colors.foreground : colors.mutedForeground }]}>
                    {SORT_LABELS[s]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}

      {/* ── Content ── */}
      {activeTab === 'alloys' && (
        <AlloyWorkshop bottomPad={bottomPad} />
      )}

      {activeTab === 'resources' && (
        filteredResources.length === 0 ? (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.emptyCenter}>
            <Feather name="box" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {search ? 'Aucun résultat' : 'Inventaire vide'}
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              {search ? `Aucune ressource pour « ${search} »` : 'Explorez le monde pour collecter des ressources'}
            </Text>
          </Animated.View>
        ) : (
          <FlatList
            data={filteredResources}
            keyExtractor={(x) => x.inv.resourceId}
            renderItem={({ item: { inv, res }, index }) => (
              <ResourceCard res={res!} qty={inv.quantity} colors={colors} index={index} />
            )}
            contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
            showsVerticalScrollIndicator={false}
          />
        )
      )}

      {activeTab === 'items' && (
        filteredItems.length === 0 ? (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.emptyCenter}>
            <Feather name="tool" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              {search || categoryFilter !== 'all' || qualityFilter !== 'all' ? 'Aucun résultat' : 'Aucun objet forgé'}
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              {search || categoryFilter !== 'all' || qualityFilter !== 'all'
                ? 'Modifiez les filtres pour voir plus d\'objets'
                : 'Rendez-vous à la Forge pour créer votre premier objet'}
            </Text>
          </Animated.View>
        ) : (
          <FlatList
            data={filteredItems}
            keyExtractor={(i) => i.instanceId}
            renderItem={({ item, index }) => (
              <CraftedItemCard item={item} onPress={() => setSelectedItemId(item.instanceId)} colors={colors} index={index} />
            )}
            contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
            showsVerticalScrollIndicator={false}
          />
        )
      )}

      {/* ── Showcase tab ── */}
      {activeTab === 'showcase' && (
        <ShowcaseSection game={game} colors={colors} bottomPad={bottomPad} />
      )}

      {/* ── Gems tab ── */}
      {activeTab === 'gems' && (
        (game.craftedGems?.length ?? 0) === 0 ? (
          <Animated.View entering={FadeInDown.duration(400)} style={styles.emptyCenter}>
            <Feather name="hexagon" size={48} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Collection vide</Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Forgez des gemmes, runes et joyaux via l&apos;Atelier des Pierres
            </Text>
          </Animated.View>
        ) : (
          <FlatList
            data={game.craftedGems ?? []}
            keyExtractor={(g: CraftedGem) => g.instanceId}
            contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad }]}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: gem }: { item: CraftedGem }) => {
              const QUALITY_COLORS: Record<string, string> = {
                failed: '#666', basic: '#AAA', decent: '#88CC88', good: '#4488FF',
                excellent: '#AA44FF', perfect: '#FFAA00', masterwork: '#FF4444',
              };
              const RARITY_COLORS: Record<string, string> = {
                common: '#AAA', uncommon: '#44FF44', rare: '#4488FF',
                epic: '#AA44FF', legendary: '#FFAA00', mythic: '#FF4444',
              };
              const QUALITY_LABELS: Record<string, string> = {
                failed: 'Raté', basic: 'Médiocre', decent: 'Acceptable', good: 'Bon',
                excellent: 'Excellent', perfect: 'Parfait', masterwork: "Chef-d'œuvre",
              };
              const qColor = QUALITY_COLORS[gem.craftQuality] ?? '#888';
              const rColor = RARITY_COLORS[gem.rarity] ?? '#888';
              return (
                <View style={[styles.resourceCard, { borderLeftColor: qColor, borderLeftWidth: 3 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                    <Feather name="hexagon" size={22} color={gem.color ?? rColor} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.resourceName, { color: rColor }]} numberOfLines={1}>
                        {gem.name}{gem.affix ? ` ${gem.affix}` : ''}
                      </Text>
                      <Text style={{ fontSize: 11, color: qColor, marginTop: 1 }}>
                        {QUALITY_LABELS[gem.craftQuality] ?? gem.craftQuality} · Niv.{gem.level}
                      </Text>
                    </View>
                    <View style={{ gap: 3, alignItems: 'flex-end' }}>
                      {Object.entries(gem.craftedStats ?? {})
                        .filter(([, v]) => v > 0).slice(0, 3)
                        .map(([stat, val]) => {
                          const range = gem.statRanges?.find(r => r.stat === stat);
                          return (
                            <Text key={stat} style={{ fontSize: 10, color: colors.mutedForeground }}>
                              +{val}{range?.unit ?? ''} {range?.label ?? stat}
                            </Text>
                          );
                        })}
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )
      )}

      {/* ── Item detail sheet ── */}
      <ItemDetailSheet
        itemInstanceId={selectedItemId}
        onClose={() => setSelectedItemId(null)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  header: { paddingHorizontal: 18, paddingBottom: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 16, fontWeight: '800', letterSpacing: 3 },
  headerForgeName: { fontSize: 11, fontWeight: '500', letterSpacing: 1, marginTop: 1 },
  weightWarning: { fontSize: 11, fontWeight: '700', textAlign: 'right', marginTop: 3 },

  tabBar: { borderBottomWidth: 1 },
  tabBarContent: { flexDirection: 'row', alignItems: 'stretch' },
  tab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 13, paddingHorizontal: 16, gap: 6, minWidth: 80 },
  tabText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  tabBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 10, minWidth: 20, alignItems: 'center' },
  tabBadgeText: { fontSize: 10, fontWeight: '800' },

  toolbarRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderBottomWidth: 1 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 38, borderRadius: 10, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  filterToggle: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },

  filterPanel: { borderBottomWidth: 1, paddingVertical: 10, gap: 8 },
  filterRow: { paddingHorizontal: 12 },
  filterSecondRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  filterChipText: { fontSize: 12, fontWeight: '600' },
  sortRow: { flexDirection: 'row', gap: 4 },
  sortChip: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  sortChipText: { fontSize: 11, fontWeight: '600' },

  listContent: { paddingHorizontal: 14, paddingTop: 10 },

  // Resource card
  resourceCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 7,
    overflow: 'hidden',
  },
  resourceStrip: { width: 4 },
  resourceBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  resourceTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  resourceIcon: { width: 24, alignItems: 'center', justifyContent: 'center' },
  resourceNameRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  resourceName: { fontSize: 14, fontWeight: '600' },
  gemBadge: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  qtyBadge: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14 },
  qtyText: { fontSize: 13, fontWeight: '700' },
  resourceMeta: { flexDirection: 'row', gap: 4, marginTop: 4, flexWrap: 'wrap' },
  resourceMetaText: { fontSize: 11 },

  // Item card
  itemCard: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 8,
    overflow: 'hidden',
  },
  itemQualityStrip: { width: 4 },
  itemBody: { flex: 1, paddingHorizontal: 13, paddingVertical: 11 },
  itemTop: { flexDirection: 'row', alignItems: 'flex-start' },
  itemInfo: { flex: 1 },
  itemCategory: { fontSize: 9, fontWeight: '800', letterSpacing: 1.5, marginBottom: 3 },
  itemName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  itemMeta: { fontSize: 11 },
  itemRight: { alignItems: 'flex-end', gap: 5, paddingLeft: 10 },
  itemValue: { fontSize: 14, fontWeight: '700' },
  gemRow: { flexDirection: 'row', gap: 3 },
  miniGem: { width: 8, height: 8, borderRadius: 4 },
  enigmaBadge: {
    position: 'absolute', top: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#5C00AA40', borderRadius: 8,
    paddingHorizontal: 6, paddingVertical: 3,
    borderWidth: 1, borderColor: '#C084FC66',
  },
  enigmaBadgeText: { fontSize: 9, fontWeight: '800', color: '#C084FC', letterSpacing: 0.5 },
  statPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  statPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statPillText: { fontSize: 11, fontWeight: '600' },

  emptyCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
