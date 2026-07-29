import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import { useGame } from '@/context/GameContext';
import { useColors } from '@/hooks/useColors';
import type { RegionData, ResourceData } from '@/types/game';

type CodexTab = 'resources' | 'recipes' | 'regions' | 'skills';

const RARITY_COLORS: Record<string, string> = {
  common: '#8A7A6A',
  uncommon: '#4CAF50',
  rare: '#2196F3',
  epic: '#9C27B0',
  legendary: '#FF9800',
};

export default function CodexScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const game = useGame();
  const [activeTab, setActiveTab] = useState<CodexTab>('resources');
  const [selectedResource, setSelectedResource] = useState<ResourceData | null>(null);
  const headerTopPad = Platform.OS === 'web' ? 67 : insets.top;

  if (!game.isLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  // Discovered resources = ones in inventory or used in crafted items
  const discoveredResourceIds = new Set([
    ...game.inventory.map((i) => i.resourceId),
    ...game.craftedItems.flatMap((item) => item.materials),
  ]);

  const discoveredRecipeIds = new Set(game.craftedItems.map((i) => i.recipeId));

  const TABS: { key: CodexTab; label: string; icon: string }[] = [
    { key: 'resources', label: 'Matériaux', icon: 'grid' },
    { key: 'recipes', label: 'Recettes', icon: 'book-open' },
    { key: 'regions', label: 'Régions', icon: 'map' },
    { key: 'skills', label: 'Compétences', icon: 'star' },
  ];

  const renderResourceEntry = ({ item: res }: { item: ResourceData }) => {
    const discovered = discoveredResourceIds.has(res.id);
    const rarityColor = RARITY_COLORS[res.rarity] ?? colors.primary;
    return (
      <TouchableOpacity
        style={[
          styles.entryCard,
          {
            backgroundColor: colors.card,
            borderColor: discovered ? rarityColor : colors.border,
            opacity: discovered ? 1 : 0.5,
          },
        ]}
        onPress={() => discovered && setSelectedResource(res)}
        activeOpacity={discovered ? 0.8 : 1}
      >
        {discovered ? (
          <>
            <View style={[styles.entryDot, { backgroundColor: res.color }]} />
            <View style={styles.entryInfo}>
              <Text style={[styles.entryName, { color: colors.foreground }]}>{res.name}</Text>
              <Text style={[styles.entryRarity, { color: rarityColor }]}>
                {res.rarity.charAt(0).toUpperCase() + res.rarity.slice(1)} · Niv.{res.level}
              </Text>
            </View>
            <Text style={[styles.entryValue, { color: colors.mutedForeground }]}>
              {res.baseValue}g
            </Text>
          </>
        ) : (
          <>
            <View style={[styles.entryDot, { backgroundColor: colors.muted }]} />
            <View style={styles.entryInfo}>
              <Text style={[styles.entryName, { color: colors.mutedForeground }]}>???</Text>
              <Text style={[styles.entryRarity, { color: colors.mutedForeground }]}>
                Non découvert
              </Text>
            </View>
            <Feather name="lock" size={16} color={colors.mutedForeground} />
          </>
        )}
      </TouchableOpacity>
    );
  };

  const renderRecipeEntry = ({ item: recipe }: { item: (typeof game.allRecipes)[0] }) => {
    const discovered = discoveredRecipeIds.has(recipe.id);
    return (
      <View
        style={[
          styles.entryCard,
          {
            backgroundColor: colors.card,
            borderColor: discovered ? colors.primary : colors.border,
            opacity: discovered ? 1 : 0.5,
          },
        ]}
      >
        {discovered ? (
          <>
            <Feather name="tool" size={18} color={colors.primary} />
            <View style={styles.entryInfo}>
              <Text style={[styles.entryName, { color: colors.foreground }]}>{recipe.name}</Text>
              <Text style={[styles.entryRarity, { color: colors.mutedForeground }]}>
                {recipe.category} · Forge Niv.{recipe.levelRequired}
              </Text>
            </View>
            <Text style={[styles.entryValue, { color: colors.accent }]}>
              +{recipe.xpReward} XP
            </Text>
          </>
        ) : (
          <>
            <Feather name="lock" size={18} color={colors.mutedForeground} />
            <View style={styles.entryInfo}>
              <Text style={[styles.entryName, { color: colors.mutedForeground }]}>???</Text>
              <Text style={[styles.entryRarity, { color: colors.mutedForeground }]}>
                Forge Niv.{recipe.levelRequired}
              </Text>
            </View>
          </>
        )}
      </View>
    );
  };

  const renderRegionEntry = ({ item: region }: { item: RegionData }) => {
    const unlocked = game.unlockedRegions.includes(region.id);
    const exploration = game.regionExploration[region.id] ?? 0;
    return (
      <View
        style={[
          styles.regionEntry,
          {
            backgroundColor: colors.card,
            borderColor: unlocked ? colors.primary : colors.border,
            opacity: unlocked ? 1 : 0.5,
          },
        ]}
      >
        <View style={styles.regionEntryLeft}>
          <Text style={[styles.regionEntryName, { color: unlocked ? colors.foreground : colors.mutedForeground }]}>
            {unlocked ? region.name : '???'}
          </Text>
          {unlocked && (
            <Text style={[styles.regionEntryBiome, { color: colors.mutedForeground }]}>
              {region.biome} · Niv.{region.levelRequired}+
            </Text>
          )}
          {!unlocked && (
            <Text style={[styles.regionEntryBiome, { color: colors.mutedForeground }]}>
              Niveau {region.levelRequired} requis
            </Text>
          )}
        </View>
        {unlocked && (
          <View style={styles.regionEntryRight}>
            <View style={[styles.exploreTrack, { backgroundColor: colors.muted }]}>
              <View
                style={[
                  styles.exploreFill,
                  { width: `${exploration}%` as `${number}%`, backgroundColor: colors.primary },
                ]}
              />
            </View>
            <Text style={[styles.explorePct, { color: colors.mutedForeground }]}>
              {exploration}%
            </Text>
          </View>
        )}
        {!unlocked && <Feather name="lock" size={16} color={colors.mutedForeground} />}
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={[colors.card as string, colors.background as string]}
        style={[styles.header, { paddingTop: headerTopPad + 12 }]}
      >
        <View style={styles.headerLeft}>
          <Feather name="book-open" size={22} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>CODEX</Text>
        </View>
        <View style={[styles.progressBadge, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.progressText, { color: colors.accent }]}>
            {discoveredResourceIds.size}/{game.allResources.length} mat.
          </Text>
        </View>
      </LinearGradient>

      {/* Horizontal Tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.tabScroll, { borderBottomColor: colors.border }]}
        contentContainerStyle={styles.tabScrollContent}
      >
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[
              styles.tab,
              activeTab === tab.key && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
            ]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Feather
              name={tab.icon as 'grid'}
              size={15}
              color={activeTab === tab.key ? colors.primary : colors.mutedForeground}
            />
            <Text
              style={[
                styles.tabText,
                { color: activeTab === tab.key ? colors.primary : colors.mutedForeground },
              ]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {activeTab === 'resources' && (
        <FlatList
          data={game.allResources}
          renderItem={renderResourceEntry}
          keyExtractor={(r) => r.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {activeTab === 'recipes' && (
        <FlatList
          data={game.allRecipes}
          renderItem={renderRecipeEntry}
          keyExtractor={(r) => r.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {activeTab === 'regions' && (
        <FlatList
          data={game.allRegions}
          renderItem={renderRegionEntry}
          keyExtractor={(r) => r.id}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        />
      )}

      {activeTab === 'skills' && (
        <ScrollView
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {game.allSkills.map((skill) => {
            const currentLevel = game.player.skills[skill.id] ?? 1;
            const nextUnlock = skill.unlocks.find((u) => u.level > currentLevel);
            return (
              <View
                key={skill.id}
                style={[
                  styles.skillEntry,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={styles.skillEntryHeader}>
                  <View style={[styles.skillDot, { backgroundColor: skill.color }]} />
                  <Text style={[styles.skillEntryName, { color: colors.foreground }]}>
                    {skill.name}
                  </Text>
                  <View style={[styles.levelTag, { backgroundColor: `${skill.color}22` }]}>
                    <Text style={[styles.levelTagText, { color: skill.color }]}>
                      Niv.{currentLevel}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.skillEntryDesc, { color: colors.mutedForeground }]}>
                  {skill.description}
                </Text>
                {nextUnlock && (
                  <Text style={[styles.nextUnlock, { color: colors.primary }]}>
                    Prochain déblocage (Niv.{nextUnlock.level}): {nextUnlock.reward}
                  </Text>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* Resource Detail Modal */}
      <Modal visible={!!selectedResource} transparent animationType="fade" statusBarTranslucent>
        {selectedResource && (
          <View style={styles.overlay}>
            <View style={[styles.resourceModal, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.resourceModalColor, { backgroundColor: selectedResource.color }]} />
              <Text style={[styles.resourceModalName, { color: colors.foreground }]}>
                {selectedResource.name}
              </Text>
              <Text
                style={[
                  styles.resourceModalRarity,
                  { color: RARITY_COLORS[selectedResource.rarity] ?? colors.primary },
                ]}
              >
                {selectedResource.rarity.toUpperCase()} · Niveau {selectedResource.level}
              </Text>
              <Text style={[styles.resourceModalDesc, { color: colors.mutedForeground }]}>
                {selectedResource.description}
              </Text>
              <View style={styles.resourceStats}>
                {[
                  { label: 'Poids', value: `${selectedResource.weight}kg` },
                  { label: 'Pureté', value: `${selectedResource.purity}%` },
                  { label: 'Valeur', value: `${selectedResource.baseValue}g` },
                ].map((s) => (
                  <View key={s.label} style={[styles.resourceStat, { backgroundColor: colors.secondary }]}>
                    <Text style={[styles.resourceStatLabel, { color: colors.mutedForeground }]}>
                      {s.label}
                    </Text>
                    <Text style={[styles.resourceStatValue, { color: colors.accent }]}>
                      {s.value}
                    </Text>
                  </View>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.closeBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                onPress={() => setSelectedResource(null)}
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
  progressBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  progressText: { fontSize: 12, fontWeight: '600' },
  tabScroll: { borderBottomWidth: 1 },
  tabScrollContent: { paddingHorizontal: 16 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 6,
    marginRight: 4,
  },
  tabText: { fontSize: 13, fontWeight: '600' },
  listContent: { paddingHorizontal: 16, paddingTop: 12 },
  entryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 8,
    gap: 10,
  },
  entryDot: { width: 14, height: 14, borderRadius: 7 },
  entryInfo: { flex: 1 },
  entryName: { fontSize: 14, fontWeight: '600' },
  entryRarity: { fontSize: 11, marginTop: 2 },
  entryValue: { fontSize: 13 },
  regionEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    marginBottom: 8,
  },
  regionEntryLeft: { flex: 1 },
  regionEntryName: { fontSize: 15, fontWeight: '600' },
  regionEntryBiome: { fontSize: 11, marginTop: 2 },
  regionEntryRight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 12 },
  exploreTrack: { width: 80, height: 4, borderRadius: 2, overflow: 'hidden' },
  exploreFill: { height: '100%', borderRadius: 2 },
  explorePct: { fontSize: 11, minWidth: 30, textAlign: 'right' },
  skillEntry: { borderRadius: 12, padding: 14, borderWidth: 1, marginBottom: 8 },
  skillEntryHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  skillDot: { width: 10, height: 10, borderRadius: 5 },
  skillEntryName: { flex: 1, fontSize: 15, fontWeight: '600' },
  levelTag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  levelTagText: { fontSize: 11, fontWeight: '700' },
  skillEntryDesc: { fontSize: 12, lineHeight: 18, marginBottom: 6 },
  nextUnlock: { fontSize: 11, lineHeight: 16 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'center', padding: 24 },
  resourceModal: { borderRadius: 20, padding: 24, borderWidth: 1, overflow: 'hidden' },
  resourceModalColor: { height: 4, borderRadius: 2, marginBottom: 16 },
  resourceModalName: { fontSize: 24, fontWeight: '800', marginBottom: 4 },
  resourceModalRarity: { fontSize: 11, fontWeight: '700', letterSpacing: 2, marginBottom: 12 },
  resourceModalDesc: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  resourceStats: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  resourceStat: { flex: 1, padding: 12, borderRadius: 10, alignItems: 'center', gap: 4 },
  resourceStatLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1 },
  resourceStatValue: { fontSize: 16, fontWeight: '700' },
  closeBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  closeBtnText: { fontSize: 14, fontWeight: '600' },
});
