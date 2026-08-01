/**
 * Inventory screen — Resources tab + Crafted Items tab.
 * Features: search, category/quality filters, sort, weight capacity bar,
 * and ItemDetailSheet with 3D viewer + gem socketing.
 */
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '@/context/GameContext';
import { useColors } from '@/hooks/useColors';
import type { Item, ItemCategory, Quality, ResourceData } from '@/types/game';
import ItemDetailSheet from '@/components/ItemDetailSheet';
import AlloyWorkshop from '@/components/AlloyWorkshop';

// ─── Types ────────────────────────────────────────────────────────────────────
type TabType = 'resources' | 'items' | 'alloys';
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

function ResourceTypeIcon({ type, size = 18 }: { type: string, size?: number }) {
  switch (type) {
    case 'metal': return <MaterialCommunityIcons name="gold" size={size} />;
    case 'wood': return <MaterialCommunityIcons name="pine-tree" size={size} />;
    case 'stone': return <MaterialCommunityIcons name="terrain" size={size} />;
    case 'gem': return <MaterialCommunityIcons name="diamond-stone" size={size} />;
    case 'organic': return <MaterialCommunityIcons name="leaf" size={size} />;
    case 'clay': return <MaterialCommunityIcons name="pot" size={size} />;
    default: return <MaterialCommunityIcons name="shape-outline" size={size} />;
  }
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
      <MaterialCommunityIcons name="weight" size={14} color={pct > 0.7 ? barColor : colors.mutedForeground} />
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
            <Text style={[styles.resourceIcon, { color: res.color }]}><ResourceTypeIcon type={res.type} size={20} /></Text>
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
          style={[styles.itemCard, { borderColor: qc }]}
        >
          <View style={[styles.itemQualityStrip, { backgroundColor: qc }]} />
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
              <MaterialCommunityIcons name="sword" size={12} color={colors.accent} style={{ marginRight: 4 }} />
              <Text style={[styles.statPillText, { color: colors.accent }]}>{item.stats.attack}</Text>
            </View>
          )}
          {item.stats.defense !== undefined && (
            <View style={[styles.statPill, { backgroundColor: colors.secondary }]}>
              <MaterialCommunityIcons name="shield" size={12} color={colors.accent} style={{ marginRight: 4 }} />
              <Text style={[styles.statPillText, { color: colors.accent }]}>{item.stats.defense}</Text>
            </View>
          )}
          {item.stats.magic !== undefined && (
            <View style={[styles.statPill, { backgroundColor: colors.secondary }]}>
              <MaterialCommunityIcons name="auto-fix" size={12} color={colors.accent} style={{ marginRight: 4 }} />
              <Text style={[styles.statPillText, { color: colors.accent }]}>{item.stats.magic}</Text>
            </View>
          )}
          {item.stats.speed !== undefined && (
            <View style={[styles.statPill, { backgroundColor: colors.secondary }]}>
              <MaterialCommunityIcons name="lightning-bolt" size={12} color={colors.accent} style={{ marginRight: 4 }} />
              <Text style={[styles.statPillText, { color: colors.accent }]}>{item.stats.speed}</Text>
            </View>
          )}
          {gemsSlotted > 0 && (
            <View style={[styles.statPill, { backgroundColor: colors.secondary }]}>
              <MaterialCommunityIcons name="diamond-stone" size={12} color="#9966CC" style={{ marginRight: 4 }} />
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
            <MaterialCommunityIcons name="alert-circle" size={14} color={colors.destructive} style={{ marginRight: 4 }} />
            <Text style={[styles.weightWarning, { color: colors.destructive, marginTop: 0 }]}>
              Inventaire presque plein !
            </Text>
          </View>
        )}
      </LinearGradient>

      {/* ── Tab bar ── */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {([
          { key: 'resources', label: 'Ressources', icon: 'diamond-stone', badge: game.inventory.length },
          { key: 'items', label: 'Objets', icon: 'sword-cross', badge: game.craftedItems.length },
          { key: 'alloys', label: 'Alliages', icon: 'merge', badge: game.discoveredAlloyIds.length },
        ] as { key: TabType; label: string; icon: string; badge: number }[]).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab.key)}
          >
            <MaterialCommunityIcons
              name={tab.icon as any}
              size={17}
              color={activeTab === tab.key ? colors.primary : colors.mutedForeground}
            />
            <Text style={[styles.tabText, { color: activeTab === tab.key ? colors.primary : colors.mutedForeground }]}>
              {tab.label}
            </Text>
            <View style={[styles.tabBadge, { backgroundColor: activeTab === tab.key ? colors.primary : colors.muted }]}>
              <Text style={[styles.tabBadgeText, { color: activeTab === tab.key ? colors.primaryForeground : colors.mutedForeground }]}>
                {tab.badge}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Search + filter row (only for resources / items) ── */}
      {activeTab !== 'alloys' && <View style={[styles.toolbarRow, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
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
            <MaterialCommunityIcons name="package-variant" size={48} color={colors.mutedForeground} />
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
            <MaterialCommunityIcons name="hammer-wrench" size={48} color={colors.mutedForeground} />
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

  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 11, gap: 6 },
  tabText: { fontSize: 13, fontWeight: '600' },
  tabBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  tabBadgeText: { fontSize: 10, fontWeight: '700' },

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
  resourceIcon: { fontSize: 18, width: 24 },
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
  statPills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  statPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statPillText: { fontSize: 11, fontWeight: '600' },

  emptyCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
