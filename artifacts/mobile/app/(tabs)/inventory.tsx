import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '@/context/GameContext';
import { useColors } from '@/hooks/useColors';
import type { Item, Quality } from '@/types/game';

type TabType = 'resources' | 'items';

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

export default function InventoryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const game = useGame();
  const [activeTab, setActiveTab] = useState<TabType>('resources');
  const [selectedItem, setSelectedItem] = useState<Item | null>(null);
  const headerTopPad = Platform.OS === 'web' ? 67 : insets.top;

  if (!game.isLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const totalWeight = game.inventory.reduce((acc, invItem) => {
    const res = game.getResourceById(invItem.resourceId);
    return acc + (res?.weight ?? 0) * invItem.quantity;
  }, 0);

  const renderResourceItem = ({ item: invItem }: { item: typeof game.inventory[0] }) => {
    const res = game.getResourceById(invItem.resourceId);
    if (!res) return null;
    return (
      <View style={[styles.resourceRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.resourceColorBar, { backgroundColor: res.color }]} />
        <View style={styles.resourceInfo}>
          <Text style={[styles.resourceName, { color: colors.foreground }]}>{res.name}</Text>
          <Text style={[styles.resourceType, { color: colors.mutedForeground }]}>
            {res.rarity} · {res.type}
          </Text>
        </View>
        <View style={[styles.qtyBadge, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.qtyText, { color: colors.accent }]}>x{invItem.quantity}</Text>
        </View>
      </View>
    );
  };

  const renderCraftedItem = ({ item }: { item: Item }) => (
    <TouchableOpacity
      style={[
        styles.craftedRow,
        { backgroundColor: colors.card, borderColor: qualityColor(item.quality, colors) },
      ]}
      onPress={() => setSelectedItem(item)}
      activeOpacity={0.8}
    >
      <View style={styles.craftedLeft}>
        <View style={[styles.qualityIndicator, { backgroundColor: qualityColor(item.quality, colors) }]} />
        <View>
          <Text style={[styles.craftedName, { color: colors.foreground }]}>{item.name}</Text>
          <Text style={[styles.craftedQuality, { color: qualityColor(item.quality, colors) }]}>
            {qualityLabel(item.quality)}
          </Text>
          <Text style={[styles.craftedCategory, { color: colors.mutedForeground }]}>
            {item.category}
          </Text>
        </View>
      </View>
      <View style={styles.craftedRight}>
        <Text style={[styles.craftedValue, { color: colors.accent }]}>{item.value}g</Text>
        <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={[colors.card as string, colors.background as string]}
        style={[styles.header, { paddingTop: headerTopPad + 12 }]}
      >
        <View style={styles.headerLeft}>
          <Feather name="archive" size={22} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>INVENTAIRE</Text>
        </View>
        <View style={[styles.weightBadge, { backgroundColor: colors.secondary }]}>
          <Feather name="package" size={13} color={colors.mutedForeground} />
          <Text style={[styles.weightText, { color: colors.mutedForeground }]}>
            {totalWeight.toFixed(1)} kg
          </Text>
        </View>
      </LinearGradient>

      {/* Tab Bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border }]}>
        {(['resources', 'items'] as TabType[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[
              styles.tab,
              activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
            onPress={() => setActiveTab(tab)}
          >
            <Feather
              name={tab === 'resources' ? 'grid' : 'package'}
              size={16}
              color={activeTab === tab ? colors.primary : colors.mutedForeground}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab ? colors.primary : colors.mutedForeground },
              ]}
            >
              {tab === 'resources' ? 'Ressources' : 'Objets forgés'}
            </Text>
            <View
              style={[
                styles.tabBadge,
                { backgroundColor: activeTab === tab ? colors.primary : colors.muted },
              ]}
            >
              <Text
                style={[
                  styles.tabBadgeText,
                  { color: activeTab === tab ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                {tab === 'resources' ? game.inventory.length : game.craftedItems.length}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'resources' ? (
        game.inventory.length === 0 ? (
          <View style={styles.emptyCenter}>
            <Feather name="package" size={40} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              Inventaire vide
            </Text>
            <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
              Explorez le monde pour collecter des ressources
            </Text>
          </View>
        ) : (
          <FlatList
            data={game.inventory}
            renderItem={renderResourceItem}
            keyExtractor={(i) => i.resourceId}
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100 },
            ]}
            showsVerticalScrollIndicator={false}
          />
        )
      ) : game.craftedItems.length === 0 ? (
        <View style={styles.emptyCenter}>
          <Feather name="tool" size={40} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            Aucun objet forgé
          </Text>
          <Text style={[styles.emptyDesc, { color: colors.mutedForeground }]}>
            Rendez-vous à la Forge pour créer votre premier objet
          </Text>
        </View>
      ) : (
        <FlatList
          data={game.craftedItems}
          renderItem={renderCraftedItem}
          keyExtractor={(i) => i.instanceId}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Item Detail Modal */}
      <Modal visible={!!selectedItem} transparent animationType="slide" statusBarTranslucent>
        {selectedItem && (
          <View style={styles.overlay}>
            <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.handle, { backgroundColor: colors.muted }]} />

              <View
                style={[
                  styles.itemQualityBar,
                  { backgroundColor: qualityColor(selectedItem.quality, colors) },
                ]}
              />
              <Text
                style={[
                  styles.itemQualityLabel,
                  { color: qualityColor(selectedItem.quality, colors) },
                ]}
              >
                {qualityLabel(selectedItem.quality)}
              </Text>
              <Text style={[styles.itemName, { color: colors.foreground }]}>
                {selectedItem.name}
              </Text>
              <Text style={[styles.itemDesc, { color: colors.mutedForeground }]}>
                {selectedItem.description}
              </Text>
              <Text style={[styles.itemLore, { color: colors.mutedForeground }]}>
                "{selectedItem.lore}"
              </Text>

              <Text style={[styles.sectionLabel, { color: colors.primary }]}>STATISTIQUES</Text>
              <View style={styles.statsGrid}>
                {selectedItem.stats.attack !== undefined && (
                  <View style={[styles.statChip, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>ATQ</Text>
                    <Text style={[styles.statValue, { color: colors.accent }]}>
                      +{selectedItem.stats.attack}
                    </Text>
                  </View>
                )}
                {selectedItem.stats.defense !== undefined && (
                  <View style={[styles.statChip, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>DEF</Text>
                    <Text style={[styles.statValue, { color: colors.accent }]}>
                      +{selectedItem.stats.defense}
                    </Text>
                  </View>
                )}
                {selectedItem.stats.magic !== undefined && (
                  <View style={[styles.statChip, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>MAG</Text>
                    <Text style={[styles.statValue, { color: colors.accent }]}>
                      +{selectedItem.stats.magic}
                    </Text>
                  </View>
                )}
                {selectedItem.stats.speed !== undefined && (
                  <View style={[styles.statChip, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>VIT</Text>
                    <Text style={[styles.statValue, { color: colors.accent }]}>
                      +{selectedItem.stats.speed}
                    </Text>
                  </View>
                )}
                {selectedItem.stats.luck !== undefined && (
                  <View style={[styles.statChip, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>CHANCE</Text>
                    <Text style={[styles.statValue, { color: colors.accent }]}>
                      +{selectedItem.stats.luck}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.metaRow}>
                <Text style={[styles.metaItem, { color: colors.mutedForeground }]}>
                  Durabilité: {selectedItem.durability}/{selectedItem.maxDurability}
                </Text>
                <Text style={[styles.metaItem, { color: colors.mutedForeground }]}>
                  Poids: {selectedItem.weight}kg
                </Text>
                <Text style={[styles.metaItem, { color: colors.accent }]}>
                  Valeur: {selectedItem.value}g
                </Text>
              </View>

              <Text style={[styles.craftInfo, { color: colors.mutedForeground }]}>
                Forgé par {selectedItem.craftedBy} ·{' '}
                {new Date(selectedItem.craftedAt).toLocaleDateString('fr-FR')}
              </Text>

              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                onPress={() => setSelectedItem(null)}
              >
                <Text style={[styles.closeBtnText, { color: colors.foreground }]}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 18, fontWeight: '800', letterSpacing: 3 },
  weightBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, gap: 5 },
  weightText: { fontSize: 12, fontWeight: '600' },
  tabBar: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  tabText: { fontSize: 13, fontWeight: '600' },
  tabBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  tabBadgeText: { fontSize: 10, fontWeight: '700' },
  listContent: { paddingHorizontal: 16, paddingTop: 12 },
  resourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    overflow: 'hidden',
  },
  resourceColorBar: { width: 4, alignSelf: 'stretch' },
  resourceInfo: { flex: 1, padding: 12 },
  resourceName: { fontSize: 14, fontWeight: '600' },
  resourceType: { fontSize: 11, marginTop: 2 },
  qtyBadge: { paddingHorizontal: 14, paddingVertical: 6, marginRight: 12, borderRadius: 20 },
  qtyText: { fontSize: 14, fontWeight: '700' },
  craftedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 8,
  },
  craftedLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  qualityIndicator: { width: 4, height: 40, borderRadius: 2 },
  craftedName: { fontSize: 14, fontWeight: '600' },
  craftedQuality: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginTop: 2 },
  craftedCategory: { fontSize: 11, marginTop: 2 },
  craftedRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  craftedValue: { fontSize: 14, fontWeight: '600' },
  emptyCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, gap: 12 },
  emptyTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  emptyDesc: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderBottomWidth: 0 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  itemQualityBar: { height: 3, borderRadius: 2, marginBottom: 12 },
  itemQualityLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 6 },
  itemName: { fontSize: 24, fontWeight: '800', marginBottom: 6 },
  itemDesc: { fontSize: 13, lineHeight: 18, marginBottom: 8 },
  itemLore: { fontSize: 12, lineHeight: 18, fontStyle: 'italic', marginBottom: 20 },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 10 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignItems: 'center', minWidth: 60 },
  statLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1 },
  statValue: { fontSize: 16, fontWeight: '700' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 10 },
  metaItem: { fontSize: 12 },
  craftInfo: { fontSize: 11, marginBottom: 20 },
  closeBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  closeBtnText: { fontSize: 15, fontWeight: '600' },
});
