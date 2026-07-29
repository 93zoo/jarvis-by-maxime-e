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
import * as Haptics from 'expo-haptics';
import { useGame } from '@/context/GameContext';
import { useColors } from '@/hooks/useColors';
import type { Item, Quality, RecipeData } from '@/types/game';

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

export default function ForgeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const game = useGame();
  const [craftedItem, setCraftedItem] = useState<Item | null>(null);
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeData | null>(null);

  if (!game.isLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const { player } = game;
  const availableRecipes = game.getAvailableRecipes();
  const xpPercent = Math.min(100, Math.floor((player.xp / player.xpToNextLevel) * 100));
  const forgeSkillLevel = player.skills['forge'] ?? 1;
  const forgeXP = player.skillXP['forge'] ?? 0;
  const forgeXPThreshold = forgeSkillLevel * 50;
  const forgeXPPercent = Math.min(100, Math.floor((forgeXP / forgeXPThreshold) * 100));
  const headerTopPad = Platform.OS === 'web' ? 67 : insets.top;

  const handleCraft = (recipe: RecipeData) => {
    if (!game.canCraftRecipe(recipe.id)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const item = game.craftItem(recipe.id);
    if (item) setCraftedItem(item);
  };

  const renderRecipeCard = ({ item: recipe }: { item: RecipeData }) => {
    const canCraft = game.canCraftRecipe(recipe.id);
    return (
      <TouchableOpacity
        style={[
          styles.recipeCard,
          { backgroundColor: colors.card, borderColor: canCraft ? colors.primary : colors.border },
        ]}
        onPress={() => setSelectedRecipe(recipe)}
        activeOpacity={0.75}
      >
        <View style={styles.recipeHeader}>
          <Text style={[styles.recipeCategory, { color: colors.primary }]} numberOfLines={1}>
            {recipe.category.toUpperCase()}
          </Text>
          {canCraft && (
            <View style={[styles.canCraftDot, { backgroundColor: colors.primary }]} />
          )}
        </View>
        <Text style={[styles.recipeName, { color: colors.foreground }]} numberOfLines={1}>
          {recipe.name}
        </Text>
        {recipe.requirements.slice(0, 2).map((req) => {
          const res = game.getResourceById(req.resourceId);
          const have = game.getInventoryQty(req.resourceId);
          return (
            <Text
              key={req.resourceId}
              style={[
                styles.reqText,
                { color: have >= req.quantity ? colors.accent : colors.destructive },
              ]}
              numberOfLines={1}
            >
              {have}/{req.quantity} {res?.name ?? req.resourceId}
            </Text>
          );
        })}
        <Text style={[styles.xpRewardText, { color: colors.mutedForeground }]}>
          +{recipe.xpReward} XP
        </Text>
      </TouchableOpacity>
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
          <Feather name="tool" size={22} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>LA FORGE</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.goldBadge, { backgroundColor: colors.secondary }]}>
            <Feather name="dollar-sign" size={13} color={colors.accent} />
            <Text style={[styles.goldText, { color: colors.accent }]}>
              {player.gold.toLocaleString()}
            </Text>
          </View>
          <View style={[styles.levelBadge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.levelText, { color: colors.primaryForeground }]}>
              Niv.{player.level}
            </Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom:
              insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Forge Status Card */}
        <LinearGradient
          colors={['#2A1A0A', '#1A0E18']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.forgeCard, { borderColor: colors.border }]}
        >
          <View style={styles.forgeCardTop}>
            <View>
              <Text style={[styles.forgeLevelLabel, { color: colors.mutedForeground }]}>
                FORGE
              </Text>
              <Text style={[styles.forgeLevelValue, { color: colors.accent }]}>
                Niveau {player.forgeLevel}
              </Text>
              <Text style={[styles.forgeSubLabel, { color: colors.mutedForeground }]}>
                {player.name}
              </Text>
            </View>
            <View style={[styles.forgeIconBg, { backgroundColor: 'rgba(212,133,26,0.15)' }]}>
              <Feather name="tool" size={36} color={colors.primary} />
            </View>
          </View>

          <View style={styles.xpSection}>
            <View style={styles.xpLabelRow}>
              <Text style={[styles.xpLabel, { color: colors.mutedForeground }]}>
                Compétence Forge Niv.{forgeSkillLevel}
              </Text>
              <Text style={[styles.xpLabel, { color: colors.mutedForeground }]}>
                {forgeXP}/{forgeXPThreshold}
              </Text>
            </View>
            <View style={[styles.xpTrack, { backgroundColor: colors.muted }]}>
              <View
                style={[
                  styles.xpFill,
                  { width: `${forgeXPPercent}%` as `${number}%`, backgroundColor: colors.primary },
                ]}
              />
            </View>
          </View>

          <View style={styles.xpSection}>
            <View style={styles.xpLabelRow}>
              <Text style={[styles.xpLabel, { color: colors.mutedForeground }]}>
                Niveau Joueur {player.level}
              </Text>
              <Text style={[styles.xpLabel, { color: colors.mutedForeground }]}>
                {player.xp}/{player.xpToNextLevel}
              </Text>
            </View>
            <View style={[styles.xpTrack, { backgroundColor: colors.muted }]}>
              <View
                style={[
                  styles.xpFill,
                  { width: `${xpPercent}%` as `${number}%`, backgroundColor: colors.accent },
                ]}
              />
            </View>
          </View>
        </LinearGradient>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          {(
            [
              { label: 'Forgés', value: String(player.totalItemsCrafted), icon: 'package' },
              { label: 'Or gagné', value: String(player.totalGoldEarned), icon: 'dollar-sign' },
              { label: 'Régions', value: `${game.unlockedRegions.length}/10`, icon: 'map' },
            ] as { label: string; value: string; icon: string }[]
          ).map((s) => (
            <View
              key={s.label}
              style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Feather name={s.icon as 'tool'} size={18} color={colors.primary} />
              <Text style={[styles.statValue, { color: colors.foreground }]}>{s.value}</Text>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Recipes */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            RECETTES DISPONIBLES
          </Text>
          <Text style={[styles.sectionCount, { color: colors.mutedForeground }]}>
            {availableRecipes.length}
          </Text>
        </View>

        {availableRecipes.length === 0 ? (
          <View style={[styles.empty, { borderColor: colors.border }]}>
            <Feather name="tool" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Améliorez votre compétence Forge pour débloquer des recettes
            </Text>
          </View>
        ) : (
          <FlatList
            data={availableRecipes}
            renderItem={renderRecipeCard}
            keyExtractor={(r) => r.id}
            numColumns={2}
            columnWrapperStyle={styles.recipeRow}
            scrollEnabled={false}
          />
        )}
      </ScrollView>

      {/* Recipe Detail Modal */}
      <Modal visible={!!selectedRecipe} transparent animationType="slide" statusBarTranslucent>
        {selectedRecipe && (
          <View style={styles.overlay}>
            <View
              style={[
                styles.sheet,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={[styles.handle, { backgroundColor: colors.muted }]} />
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {selectedRecipe.name}
              </Text>
              <Text style={[styles.sheetDesc, { color: colors.mutedForeground }]}>
                {selectedRecipe.description}
              </Text>

              <Text style={[styles.sheetLabel, { color: colors.primary }]}>MATÉRIAUX</Text>
              {selectedRecipe.requirements.map((req) => {
                const res = game.getResourceById(req.resourceId);
                const have = game.getInventoryQty(req.resourceId);
                const ok = have >= req.quantity;
                return (
                  <View key={req.resourceId} style={styles.matRow}>
                    <View style={[styles.matDot, { backgroundColor: res?.color ?? colors.muted }]} />
                    <Text style={[styles.matName, { color: colors.foreground }]}>
                      {res?.name ?? req.resourceId}
                    </Text>
                    <Text style={[styles.matQty, { color: ok ? colors.accent : colors.destructive }]}>
                      {have}/{req.quantity}
                    </Text>
                  </View>
                );
              })}

              <View style={styles.sheetMeta}>
                <Text style={[styles.sheetMetaText, { color: colors.mutedForeground }]}>
                  ⏱ {selectedRecipe.baseTime}s
                </Text>
                <Text style={[styles.sheetMetaText, { color: colors.accent }]}>
                  +{selectedRecipe.xpReward} XP Forge
                </Text>
              </View>

              <View style={styles.sheetBtns}>
                <TouchableOpacity
                  style={[styles.btnCancel, { borderColor: colors.border }]}
                  onPress={() => setSelectedRecipe(null)}
                >
                  <Text style={[styles.btnCancelText, { color: colors.mutedForeground }]}>
                    Annuler
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.btnCraft,
                    {
                      backgroundColor: game.canCraftRecipe(selectedRecipe.id)
                        ? colors.primary
                        : colors.muted,
                    },
                  ]}
                  onPress={() => {
                    handleCraft(selectedRecipe);
                    setSelectedRecipe(null);
                  }}
                  disabled={!game.canCraftRecipe(selectedRecipe.id)}
                >
                  <Feather name="tool" size={15} color={colors.primaryForeground} />
                  <Text style={[styles.btnCraftText, { color: colors.primaryForeground }]}>
                    Forger
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Modal>

      {/* Craft Result Modal */}
      <Modal visible={!!craftedItem} transparent animationType="fade" statusBarTranslucent>
        {craftedItem && (
          <View style={styles.overlay}>
            <View
              style={[
                styles.resultBox,
                {
                  backgroundColor: colors.card,
                  borderColor: qualityColor(craftedItem.quality, colors),
                },
              ]}
            >
              <Text
                style={[styles.resultQuality, { color: qualityColor(craftedItem.quality, colors) }]}
              >
                {qualityLabel(craftedItem.quality)}
              </Text>
              <Text style={[styles.resultName, { color: colors.foreground }]}>
                {craftedItem.name}
              </Text>
              <Text style={[styles.resultScore, { color: colors.mutedForeground }]}>
                Score: {craftedItem.qualityScore}/100
              </Text>
              <View style={styles.resultStats}>
                {craftedItem.stats.attack !== undefined && (
                  <Text style={[styles.resultStat, { color: colors.accent }]}>
                    ATQ +{craftedItem.stats.attack}
                  </Text>
                )}
                {craftedItem.stats.defense !== undefined && (
                  <Text style={[styles.resultStat, { color: colors.accent }]}>
                    DEF +{craftedItem.stats.defense}
                  </Text>
                )}
                {craftedItem.stats.magic !== undefined && (
                  <Text style={[styles.resultStat, { color: colors.accent }]}>
                    MAG +{craftedItem.stats.magic}
                  </Text>
                )}
                {craftedItem.stats.speed !== undefined && (
                  <Text style={[styles.resultStat, { color: colors.accent }]}>
                    VIT +{craftedItem.stats.speed}
                  </Text>
                )}
              </View>
              <Text style={[styles.resultValue, { color: colors.primary }]}>
                Valeur: {craftedItem.value} pièces d'or
              </Text>
              <TouchableOpacity
                style={[styles.resultBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  setCraftedItem(null);
                }}
              >
                <Text style={[styles.resultBtnText, { color: colors.primaryForeground }]}>
                  Ajouter à l'inventaire
                </Text>
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  goldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 3,
  },
  goldText: { fontSize: 14, fontWeight: '700' },
  levelBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  levelText: { fontSize: 13, fontWeight: '700' },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 16 },
  forgeCard: { borderRadius: 16, padding: 20, borderWidth: 1, marginBottom: 16 },
  forgeCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  forgeLevelLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 4 },
  forgeLevelValue: { fontSize: 26, fontWeight: '800', marginBottom: 4 },
  forgeSubLabel: { fontSize: 13 },
  forgeIconBg: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  xpSection: { marginBottom: 10 },
  xpLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  xpLabel: { fontSize: 11 },
  xpTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 3, minWidth: 4 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  statCard: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    gap: 4,
  },
  statValue: { fontSize: 17, fontWeight: '700' },
  statLabel: { fontSize: 10, letterSpacing: 0.5 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  sectionCount: { fontSize: 13 },
  recipeRow: { gap: 10, marginBottom: 10 },
  recipeCard: { flex: 1, borderRadius: 12, padding: 14, borderWidth: 1, minHeight: 100 },
  recipeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  recipeCategory: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  canCraftDot: { width: 8, height: 8, borderRadius: 4 },
  recipeName: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  reqText: { fontSize: 10, marginBottom: 2 },
  xpRewardText: { fontSize: 10, marginTop: 4 },
  empty: {
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: 40,
    alignItems: 'center',
    gap: 12,
  },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetTitle: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  sheetDesc: { fontSize: 14, lineHeight: 20, marginBottom: 20 },
  sheetLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 12 },
  matRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 10 },
  matDot: { width: 12, height: 12, borderRadius: 6 },
  matName: { flex: 1, fontSize: 14 },
  matQty: { fontSize: 14, fontWeight: '600' },
  sheetMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 20,
  },
  sheetMetaText: { fontSize: 13 },
  sheetBtns: { flexDirection: 'row', gap: 12 },
  btnCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  btnCancelText: { fontSize: 14, fontWeight: '600' },
  btnCraft: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  btnCraftText: { fontSize: 15, fontWeight: '700' },
  resultBox: {
    margin: 24,
    borderRadius: 20,
    padding: 24,
    borderWidth: 2,
    alignItems: 'center',
  },
  resultQuality: { fontSize: 12, fontWeight: '700', letterSpacing: 3, marginBottom: 8 },
  resultName: { fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  resultScore: { fontSize: 13, marginBottom: 16 },
  resultStats: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 12 },
  resultStat: { fontSize: 16, fontWeight: '600' },
  resultValue: { fontSize: 18, fontWeight: '700', marginBottom: 20 },
  resultBtn: { paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  resultBtnText: { fontSize: 15, fontWeight: '700' },
});
