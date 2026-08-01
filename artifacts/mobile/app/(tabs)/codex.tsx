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
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useGame } from '@/context/GameContext';
import { useColors } from '@/hooks/useColors';
import type { Quest, RegionData, ResourceData } from '@/types/game';
import ProfileScreen from './profile';

type CodexTab = 'resources' | 'recipes' | 'regions' | 'skills' | 'quests' | 'profil';

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
  const [recipeMessage, setRecipeMessage] = useState<string | null>(null);
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

  // Resource IDs that can be produced via the alloy fusion system
  const alloyOutputIds = new Set(game.allAlloys.map((a) => a.outputResourceId));

  const TABS: { key: CodexTab; label: string; icon: string }[] = [
    { key: 'resources', label: 'Matériaux', icon: 'diamond-stone' },
    { key: 'recipes', label: 'Recettes', icon: 'book-open-page-variant' },
    { key: 'regions', label: 'Régions', icon: 'map' },
    { key: 'skills', label: 'Talents', icon: 'auto-fix' },
    { key: 'quests', label: 'Quêtes', icon: 'flag-triangle' },
    { key: 'profil', label: 'Profil', icon: 'account' },
  ];

  const activeQuests = game.getActiveQuests();
  const completedCount = game.completedQuestIds.length;

  const renderQuestEntry = (quest: Quest & { progress?: Record<string, number>; isActive?: boolean }) => {
    const isActive = game.activeQuestIds.includes(quest.id);
    const isCompleted = game.completedQuestIds.includes(quest.id);
    const progress = quest.progress ?? game.questProgress[quest.id] ?? {};
    const allDone = quest.objectives.every((obj) => (progress[obj.id] ?? 0) >= obj.required);
    const region = game.allRegions.find((r) => r.id === quest.regionId);
    return (
      <View
        key={quest.id}
        style={[
          styles.questCard,
          {
            backgroundColor: colors.card,
            borderColor: isCompleted ? '#4CAF50' : isActive ? colors.primary : colors.border,
            opacity: isCompleted ? 0.6 : 1,
          },
        ]}
      >
        <View style={styles.questCardHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.questTitle, { color: colors.foreground }]}>{quest.title}</Text>
            <Text style={[styles.questRegion, { color: colors.mutedForeground }]}>
              {region?.name ?? quest.regionId}
            </Text>
          </View>
          {isCompleted && <Feather name="check-circle" size={18} color="#4CAF50" />}
          {!isCompleted && !isActive && (
            <TouchableOpacity
              style={[styles.acceptBtn, { backgroundColor: colors.primary }]}
              onPress={() => { game.acceptQuest(quest.id); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.acceptBtnText, { color: colors.primaryForeground }]}>Accepter</Text>
            </TouchableOpacity>
          )}
          {isActive && !allDone && (
            <View style={[styles.activeBadge, { backgroundColor: colors.primary + '28' }]}>
              <Text style={[styles.activeBadgeText, { color: colors.primary }]}>EN COURS</Text>
            </View>
          )}
        </View>
        <Text style={[styles.questDesc, { color: colors.mutedForeground }]}>{quest.description}</Text>
        {/* Objectives */}
        {(isActive || isCompleted) && quest.objectives.map((obj) => {
          const cur = isCompleted ? obj.required : (progress[obj.id] ?? 0);
          const pct = Math.min(100, Math.floor((cur / obj.required) * 100));
          return (
            <View key={obj.id} style={styles.objRow}>
              <Feather
                name={cur >= obj.required ? 'check-circle' : 'circle'}
                size={13}
                color={cur >= obj.required ? '#4CAF50' : colors.mutedForeground}
              />
              <View style={{ flex: 1, marginLeft: 8 }}>
                <View style={styles.objProgressRow}>
                  <Text style={[styles.objText, { color: colors.foreground }]}>{obj.description}</Text>
                  <Text style={[styles.objCount, { color: colors.accent }]}>{cur}/{obj.required}</Text>
                </View>
                <View style={[styles.objTrack, { backgroundColor: colors.muted }]}>
                  <View style={[styles.objFill, { width: `${pct}%` as `${number}%`, backgroundColor: cur >= obj.required ? '#4CAF50' : colors.primary }]} />
                </View>
              </View>
            </View>
          );
        })}
        {/* Rewards */}
        <View style={styles.questRewards}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialCommunityIcons name="gold" size={14} color={colors.accent} />
            <Text style={[styles.questRewardItem, { color: colors.accent }]}>{quest.rewards.gold}g</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <MaterialCommunityIcons name="star" size={14} color={colors.primary} />
            <Text style={[styles.questRewardItem, { color: colors.primary }]}>{quest.rewards.xp} XP</Text>
          </View>
          {quest.rewards.unlockRegion && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <MaterialCommunityIcons name="map" size={14} color="#9C27B0" />
              <Text style={[styles.questRewardItem, { color: '#9C27B0' }]}>Débloque région</Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  const renderResourceEntry = ({ item: res, index }: { item: ResourceData; index: number }) => {
    const discovered = discoveredResourceIds.has(res.id);
    const rarityColor = RARITY_COLORS[res.rarity] ?? colors.primary;
    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index * 30, 400)).springify()}>
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
      </Animated.View>
    );
  };

  const renderRecipeEntry = ({ item: recipe, index }: { item: (typeof game.allRecipes)[0]; index: number }) => {
    const unlocked = game.player.unlockedRecipeIds.includes(recipe.id);
    const discovered = discoveredRecipeIds.has(recipe.id);
    const skillLevel = game.player.skills[recipe.skillRequired] ?? 0;
    const meetsLevel = skillLevel >= recipe.levelRequired;
    const unlockCost = game.getRecipeUnlockCost(recipe.id);
    const canUnlock = !unlocked && meetsLevel && game.player.gold >= unlockCost;
    const handleUnlock = () => {
      if (!game.unlockRecipe(recipe.id)) {
        setRecipeMessage(
          !meetsLevel
            ? `Forge niveau ${recipe.levelRequired} requis pour cette recette.`
            : `Or insuffisant : ${unlockCost}g requis.`,
        );
        setTimeout(() => setRecipeMessage(null), 2400);
        return;
      }
      setRecipeMessage(`${recipe.name} débloquée !`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(() => setRecipeMessage(null), 2400);
    };
    const needsAlloy = recipe.requirements.some((r) => alloyOutputIds.has(r.resourceId));
    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index * 30, 400)).springify()}>
      <View
        style={[
          styles.entryCard,
          {
            backgroundColor: colors.card,
            borderColor: unlocked ? colors.primary : colors.border,
            opacity: unlocked ? 1 : 0.82,
          },
        ]}
      >
        {unlocked ? (
          <>
            <Feather name="tool" size={18} color={colors.primary} />
            <View style={styles.entryInfo}>
              <Text style={[styles.entryName, { color: colors.foreground }]}>{recipe.name}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={[styles.entryRarity, { color: colors.mutedForeground }]}>
                  {recipe.category} · Forge Niv.{recipe.levelRequired} {discovered ? '· Découverte' : '· Débloquée'}
                </Text>
                {needsAlloy && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#D4A53720', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#D4A53760' }}>
                    <MaterialCommunityIcons name="merge" size={10} color="#D4A537" />
                    <Text style={{ fontSize: 9, fontWeight: '700', color: '#D4A537' }}>ALLIAGE</Text>
                  </View>
                )}
              </View>
            </View>
            <Text style={[styles.entryValue, { color: colors.accent }]}>
              +{recipe.xpReward} XP
            </Text>
          </>
        ) : (
          <>
            <Feather name="lock" size={18} color={colors.mutedForeground} />
            <View style={styles.entryInfo}>
              <Text style={[styles.entryName, { color: colors.foreground }]}>{recipe.name}</Text>
              <Text style={[styles.entryRarity, { color: colors.mutedForeground }]}>
                Forge Niv.{recipe.levelRequired}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.unlockRecipeBtn,
                { backgroundColor: canUnlock ? colors.primary : colors.secondary, borderColor: canUnlock ? colors.primary : colors.border },
              ]}
              onPress={handleUnlock}
              disabled={!canUnlock}
              activeOpacity={0.8}
            >
              <Text style={[styles.unlockRecipeText, { color: canUnlock ? colors.primaryForeground : colors.mutedForeground }]}>
                {meetsLevel ? `${unlockCost}g` : `Niv.${recipe.levelRequired}`}
              </Text>
              {meetsLevel && <Text style={[styles.unlockRecipeLabel, { color: canUnlock ? colors.primaryForeground : colors.mutedForeground }]}>Débloquer</Text>}
            </TouchableOpacity>
          </>
        )}
      </View>
      </Animated.View>
    );
  };

  const renderRegionEntry = ({ item: region, index }: { item: RegionData; index: number }) => {
    const unlocked = game.unlockedRegions.includes(region.id);
    const exploration = game.regionExploration[region.id] ?? 0;
    return (
      <Animated.View entering={FadeInDown.delay(Math.min(index * 30, 400)).springify()}>
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
      </Animated.View>
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

      {/* Tab bar — all 5 tabs always visible, no horizontal scroll needed */}
      <View style={[styles.tabRow, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                isActive && { borderBottomColor: colors.primary, borderBottomWidth: 2 },
              ]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              <MaterialCommunityIcons
                name={tab.icon as any}
                size={20}
                color={isActive ? colors.primary : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.tabText,
                  { color: isActive ? colors.primary : colors.mutedForeground },
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeTab === 'profil' && (
        <View style={{ flex: 1 }}>
          <ProfileScreen />
        </View>
      )}

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
        <>
          {recipeMessage && (
            <View style={[styles.recipeMessage, { backgroundColor: colors.secondary, borderColor: colors.primary }]}>
              <Text style={[styles.recipeMessageText, { color: colors.foreground }]}>{recipeMessage}</Text>
            </View>
          )}
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
        </>
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

      {activeTab === 'quests' && (
        <ScrollView
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Summary row */}
          <View style={[styles.questSummary, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.questSummaryItem}>
              <Text style={[styles.questSummaryValue, { color: colors.accent }]}>{activeQuests.length}</Text>
              <Text style={[styles.questSummaryLabel, { color: colors.mutedForeground }]}>En cours</Text>
            </View>
            <View style={[styles.questSummarySep, { backgroundColor: colors.border }]} />
            <View style={styles.questSummaryItem}>
              <Text style={[styles.questSummaryValue, { color: '#4CAF50' }]}>{completedCount}</Text>
              <Text style={[styles.questSummaryLabel, { color: colors.mutedForeground }]}>Complétées</Text>
            </View>
            <View style={[styles.questSummarySep, { backgroundColor: colors.border }]} />
            <View style={styles.questSummaryItem}>
              <Text style={[styles.questSummaryValue, { color: colors.foreground }]}>{game.allQuests.length}</Text>
              <Text style={[styles.questSummaryLabel, { color: colors.mutedForeground }]}>Total</Text>
            </View>
          </View>
          {/* Active quests first */}
          {activeQuests.length > 0 && (
            <Text style={[styles.questGroupLabel, { color: colors.primary }]}>EN COURS</Text>
          )}
          {activeQuests.map((q) => renderQuestEntry(q))}
          {/* Available quests */}
          {(() => {
            const available = game.allQuests.filter(
              (q) => !game.activeQuestIds.includes(q.id) && !game.completedQuestIds.includes(q.id),
            );
            return available.length > 0 ? (
              <>
                <Text style={[styles.questGroupLabel, { color: colors.mutedForeground }]}>DISPONIBLES</Text>
                {available.map((q) => renderQuestEntry({ ...q, progress: {} }))}
              </>
            ) : null;
          })()}
          {/* Completed quests */}
          {completedCount > 0 && (
            <>
              <Text style={[styles.questGroupLabel, { color: '#4CAF50' }]}>COMPLÉTÉES ({completedCount})</Text>
              {game.allQuests
                .filter((q) => game.completedQuestIds.includes(q.id))
                .map((q) => renderQuestEntry({ ...q, progress: {} }))}
            </>
          )}
        </ScrollView>
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
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    gap: 4,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
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
  unlockRecipeBtn: { minWidth: 76, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  unlockRecipeText: { fontSize: 12, fontWeight: '800' },
  unlockRecipeLabel: { fontSize: 9, fontWeight: '700', marginTop: 1 },
  recipeMessage: { marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  recipeMessageText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
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
  // Quest styles
  questSummary: { flexDirection: 'row', borderRadius: 12, padding: 16, borderWidth: 1, marginBottom: 12, alignItems: 'center' },
  questSummaryItem: { flex: 1, alignItems: 'center', gap: 3 },
  questSummaryValue: { fontSize: 22, fontWeight: '800' },
  questSummaryLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1 },
  questSummarySep: { width: 1, height: 30 },
  questGroupLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 8, marginTop: 4 },
  questCard: { borderRadius: 14, padding: 14, borderWidth: 1, marginBottom: 10 },
  questCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  questTitle: { fontSize: 14, fontWeight: '700' },
  questRegion: { fontSize: 11, marginTop: 2 },
  questDesc: { fontSize: 12, lineHeight: 17, marginBottom: 10 },
  acceptBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  acceptBtnText: { fontSize: 11, fontWeight: '700' },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  activeBadgeText: { fontSize: 10, fontWeight: '700' },
  objRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 7 },
  objProgressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  objText: { fontSize: 12, flex: 1 },
  objCount: { fontSize: 11, fontWeight: '700', marginLeft: 8 },
  objTrack: { height: 3, borderRadius: 2, overflow: 'hidden' },
  objFill: { height: '100%', borderRadius: 2 },
  questRewards: { flexDirection: 'row', gap: 12, marginTop: 6 },
  questRewardItem: { fontSize: 12, fontWeight: '600' },
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
