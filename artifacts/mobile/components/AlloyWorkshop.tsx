/**
 * AlloyWorkshop — Standalone component for the alloy fusion system.
 * Rendered inside the Inventaire screen as a 3rd tab.
 * Sub-components are defined BEFORE the main export (Hermes hoisting rule).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
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
import { LinearGradient } from '@/lib/LinearGradientSafe';
import * as Haptics from 'expo-haptics';
import { useGame } from '@/context/GameContext';
import { useColors } from '@/hooks/useColors';
import type { AlloyData } from '@/types/game';

// ─── Rarity colors ──────────────────────────────────────────────────────────
const RARITY_COLORS: Record<string, string> = {
  common: '#8A7A6A',
  uncommon: '#4CAF50',
  rare: '#2196F3',
  epic: '#9C27B0',
  legendary: '#FF9800',
};

// ─── IngredientPill ──────────────────────────────────────────────────────────
function IngredientPill({
  resourceId,
  required,
  colors,
}: {
  resourceId: string;
  required: number;
  colors: ReturnType<typeof useColors>;
}) {
  const game = useGame();
  const res = game.getResourceById(resourceId);
  const have = game.getInventoryQty(resourceId);
  const ok = have >= required;
  const resColor = res?.color ?? colors.mutedForeground;
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: ok ? resColor + '22' : colors.secondary,
          borderColor: ok ? resColor + '88' : colors.border,
        },
      ]}
    >
      <View style={[styles.pillDot, { backgroundColor: ok ? resColor : colors.mutedForeground }]} />
      <Text style={[styles.pillText, { color: ok ? resColor : colors.mutedForeground }]}>
        {res?.name ?? resourceId}
      </Text>
      <Text
        style={[
          styles.pillCount,
          { color: ok ? resColor : colors.destructive, fontWeight: '700' },
        ]}
      >
        {have}/{required}
      </Text>
    </View>
  );
}

// ─── AlloyCard ───────────────────────────────────────────────────────────────
function AlloyCard({
  alloy,
  onFuse,
  colors,
}: {
  alloy: AlloyData;
  onFuse: (alloy: AlloyData) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const game = useGame();
  const discovered = game.discoveredAlloyIds.includes(alloy.id);
  const outRes = game.getResourceById(alloy.outputResourceId);
  const outColor = outRes?.color ?? colors.accent;
  const meetsLevel = game.player.level >= alloy.levelRequired;
  const hasIngredients = alloy.ingredients.every(
    (ing) => game.getInventoryQty(ing.resourceId) >= ing.quantity,
  );
  const canFuse = meetsLevel && hasIngredients;

  return (
    <LinearGradient
      colors={['rgba(30,25,18,0.95)', 'rgba(12,10,8,0.98)']}
      style={[
        styles.card,
        { borderColor: discovered ? outColor + '60' : 'rgba(200,140,60,0.2)' },
      ]}
    >
      {/* Left strip colored by output resource */}
      <View style={[styles.cardStrip, { backgroundColor: outColor }]} />

      <View style={styles.cardBody}>
        {/* Header row */}
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Feather name="activity" size={16} color={outColor} style={{ marginRight: 6 }} />
            <Text style={[styles.cardName, { color: discovered ? colors.foreground : colors.mutedForeground }]}>
              {discovered ? alloy.name : '???'}
            </Text>
            {!meetsLevel && (
              <View style={[styles.lvlBadge, { backgroundColor: colors.muted }]}>
                <Feather name="lock" size={10} color={colors.mutedForeground} />
                <Text style={[styles.lvlBadgeText, { color: colors.mutedForeground }]}>Niv.{alloy.levelRequired}</Text>
              </View>
            )}
            {meetsLevel && discovered && (
              <View style={[styles.lvlBadge, { backgroundColor: outColor + '25' }]}>
                <Text style={[styles.lvlBadgeText, { color: outColor }]}>Niv.{alloy.levelRequired}</Text>
              </View>
            )}
          </View>
          {/* Output */}
          <View style={styles.outputTag}>
            <View style={[styles.outputDot, { backgroundColor: outColor }]} />
            <Text style={[styles.outputText, { color: outColor }]}>
              {outRes?.name ?? alloy.outputResourceId} ×{alloy.outputQuantity}
            </Text>
          </View>
        </View>

        {/* Description / hint */}
        {discovered ? (
          <Text style={[styles.cardDesc, { color: colors.mutedForeground }]} numberOfLines={2}>
            {alloy.description}
          </Text>
        ) : (
          <Text style={[styles.cardDesc, { color: colors.mutedForeground, fontStyle: 'italic' }]} numberOfLines={2}>
            {alloy.hint}
          </Text>
        )}

        {/* Ingredients */}
        <View style={styles.ingredients}>
          {alloy.ingredients.map((ing) => (
            <IngredientPill
              key={ing.resourceId}
              resourceId={ing.resourceId}
              required={ing.quantity}
              colors={colors}
            />
          ))}
        </View>

        {/* Fuse button */}
        <TouchableOpacity
          style={[
            styles.fuseBtn,
            {
              backgroundColor: canFuse ? outColor : colors.secondary,
              opacity: canFuse ? 1 : 0.55,
            },
          ]}
          onPress={() => canFuse && onFuse(alloy)}
          disabled={!canFuse}
          activeOpacity={0.75}
        >
          <Feather
            name={canFuse ? 'git-merge' : 'lock'}
            size={15}
            color={canFuse ? '#0D0A07' : colors.mutedForeground}
            style={{ marginRight: 6 }}
          />
          <Text style={[styles.fuseBtnText, { color: canFuse ? '#0D0A07' : colors.mutedForeground }]}>
            {!meetsLevel
              ? `Niveau ${alloy.levelRequired} requis`
              : !hasIngredients
              ? 'Ressources insuffisantes'
              : 'Fusionner'}
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

// ─── FusionModal ─────────────────────────────────────────────────────────────
function FusionModal({
  alloy,
  onDone,
  colors,
}: {
  alloy: AlloyData | null;
  onDone: (result: { success: boolean; message: string } | null) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const game = useGame();
  const progress = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState<'animating' | 'result'>('animating');
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const outRes = alloy ? game.getResourceById(alloy.outputResourceId) : null;
  const outColor = outRes?.color ?? '#E8B84B';

  useEffect(() => {
    if (!alloy) return;
    progress.setValue(0);
    setPhase('animating');
    setResult(null);

    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: 2500,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      if (!finished) return;
      const res = game.fuseAlloy(alloy.id);
      setResult(res);
      setPhase('result');
      if (res.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      }
    });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alloy?.id]);

  const barColor = progress.interpolate({
    inputRange: [0, 0.3, 0.6, 0.85, 1],
    outputRange: ['#1A0800', '#8B1500', '#D43000', '#FF7A1A', outColor],
  });

  if (!alloy) return null;

  return (
    <Modal transparent animationType="fade" visible statusBarTranslucent>
      <View style={styles.overlay}>
        <LinearGradient
          colors={['rgba(20,15,8,0.98)', 'rgba(10,8,4,0.99)']}
          style={[styles.fusionCard, { borderColor: outColor + '50' }]}
        >
          {/* Icon */}
          <Feather name="activity" size={42} color={outColor} style={{ marginBottom: 12 }} />

          {/* Title */}
          <Text style={[styles.fusionTitle, { color: outColor }]}>
            {phase === 'animating' ? 'Fusion en cours…' : result?.success ? 'Fusion réussie !' : 'Échec'}
          </Text>
          <Text style={[styles.fusionSubtitle, { color: colors.mutedForeground }]}>
            {alloy.name}
          </Text>

          {/* Heat gauge */}
          {phase === 'animating' && (
            <View style={[styles.gaugeTrack, { backgroundColor: colors.muted }]}>
              <Animated.View
                style={[
                  styles.gaugeFill,
                  { width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), backgroundColor: barColor },
                ]}
              />
            </View>
          )}

          {/* Result */}
          {phase === 'result' && result && (
            <>
              <View style={[styles.resultRow, { backgroundColor: result.success ? outColor + '20' : colors.muted }]}>
                <Feather
                  name={result.success ? 'check-circle' : 'alert-circle'}
                  size={22}
                  color={result.success ? outColor : colors.destructive}
                />
                <Text style={[styles.resultText, { color: result.success ? outColor : colors.destructive }]}>
                  {result.message}
                </Text>
              </View>
              {result.success && outRes && (
                <View style={styles.rewardRow}>
                  <View style={[styles.rewardDot, { backgroundColor: outRes.color }]} />
                  <Text style={[styles.rewardText, { color: outRes.color }]}>
                    +{alloy.outputQuantity} {outRes.name}
                  </Text>
                </View>
              )}
              <TouchableOpacity
                style={[styles.doneBtn, { backgroundColor: outColor }]}
                onPress={() => onDone(result)}
                activeOpacity={0.8}
              >
                <Text style={styles.doneBtnText}>Fermer</Text>
              </TouchableOpacity>
            </>
          )}
        </LinearGradient>
      </View>
    </Modal>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
type FilterMode = 'all' | 'available' | 'discovered';

export default function AlloyWorkshop({ bottomPad }: { bottomPad: number }) {
  const game = useGame();
  const colors = useColors();

  const [filter, setFilter] = useState<FilterMode>('all');
  const [fusingAlloy, setFusingAlloy] = useState<AlloyData | null>(null);
  const [lastResult, setLastResult] = useState<{ success: boolean; message: string } | null>(null);

  const alloys = game.allAlloys;

  const filtered = alloys.filter((alloy) => {
    if (filter === 'available') {
      const meetsLevel = game.player.level >= alloy.levelRequired;
      const hasIngredients = alloy.ingredients.every(
        (ing) => game.getInventoryQty(ing.resourceId) >= ing.quantity,
      );
      return meetsLevel && hasIngredients;
    }
    if (filter === 'discovered') return game.discoveredAlloyIds.includes(alloy.id);
    return true;
  });

  const discoveredCount = game.discoveredAlloyIds.length;

  const handleFuse = useCallback(
    (alloy: AlloyData) => {
      setLastResult(null);
      setFusingAlloy(alloy);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    },
    [],
  );

  const handleDone = useCallback((res: { success: boolean; message: string } | null) => {
    setFusingAlloy(null);
    if (res) setLastResult(res);
    setTimeout(() => setLastResult(null), 3000);
  }, []);

  const FILTERS: { key: FilterMode; label: string; icon: string }[] = [
    { key: 'all', label: 'Tous', icon: 'list' },
    { key: 'available', label: 'Disponibles', icon: 'check-circle' },
    { key: 'discovered', label: 'Découverts', icon: 'eye' },
  ];

  return (
    <View style={{ flex: 1 }}>
      {/* Filter bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[styles.filterBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 14, paddingVertical: 8 }}
      >
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.filterChip,
              {
                backgroundColor: filter === f.key ? '#E8B84B' : colors.secondary,
                borderColor: filter === f.key ? '#E8B84B' : colors.border,
              },
            ]}
            onPress={() => setFilter(f.key)}
            activeOpacity={0.75}
          >
            <Feather
              name={f.icon as any}
              size={13}
              color={filter === f.key ? '#0D0A07' : colors.mutedForeground}
            />
            <Text
              style={[
                styles.filterChipText,
                { color: filter === f.key ? '#0D0A07' : colors.mutedForeground },
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
        <View style={[styles.progressPill, { backgroundColor: colors.secondary }]}>
          <Feather name="droplet" size={13} color="#E8B84B" />
          <Text style={[styles.progressPillText, { color: '#E8B84B' }]}>
            {discoveredCount}/{alloys.length}
          </Text>
        </View>
      </ScrollView>

      {/* Toast result */}
      {lastResult && (
        <View
          style={[
            styles.toast,
            {
              backgroundColor: lastResult.success ? '#1A2E12' : '#2E1212',
              borderColor: lastResult.success ? '#4CAF50' : colors.destructive,
            },
          ]}
        >
          <Feather
            name={lastResult.success ? 'check-circle' : 'alert-circle'}
            size={16}
            color={lastResult.success ? '#4CAF50' : colors.destructive}
          />
          <Text style={[styles.toastText, { color: lastResult.success ? '#4CAF50' : colors.destructive }]}>
            {lastResult.message}
          </Text>
        </View>
      )}

      {/* List */}
      {filtered.length === 0 ? (
        <View style={styles.emptyCenter}>
          <Feather name="droplet" size={48} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {filter === 'available'
              ? 'Aucun alliage fusionnable pour l\'instant.'
              : filter === 'discovered'
              ? 'Aucun alliage découvert — essayez d\'en fusionner un !'
              : 'Aucun alliage disponible.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => (
            <AlloyCard alloy={item} onFuse={handleFuse} colors={colors} />
          )}
          contentContainerStyle={{ padding: 12, gap: 10, paddingBottom: bottomPad }}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Fusion modal */}
      {fusingAlloy && (
        <FusionModal alloy={fusingAlloy} onDone={handleDone} colors={colors} />
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Cards
  card: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardStrip: { width: 4 },
  cardBody: { flex: 1, padding: 12, gap: 8 },
  cardHeader: { gap: 4 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  cardName: { fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  lvlBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  lvlBadgeText: { fontSize: 10, fontWeight: '700' },
  outputTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  outputDot: { width: 7, height: 7, borderRadius: 4 },
  outputText: { fontSize: 12, fontWeight: '600' },
  cardDesc: { fontSize: 12, lineHeight: 17 },
  // Ingredients
  ingredients: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 7, paddingVertical: 4,
    borderRadius: 8, borderWidth: 1,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { fontSize: 11, fontWeight: '600' },
  pillCount: { fontSize: 11 },
  // Fuse button
  fuseBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 9, borderRadius: 10,
  },
  fuseBtnText: { fontSize: 13, fontWeight: '700' },
  // Filter bar
  filterBar: { borderBottomWidth: 1, maxHeight: 50 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  filterChipText: { fontSize: 12, fontWeight: '600' },
  progressPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, marginLeft: 4,
  },
  progressPillText: { fontSize: 12, fontWeight: '700' },
  // Toast
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    margin: 10, padding: 10, borderRadius: 10, borderWidth: 1,
  },
  toastText: { fontSize: 13, fontWeight: '600', flex: 1 },
  // Empty
  emptyCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
  // Modal
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.82)',
    alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },
  fusionCard: {
    width: '100%', maxWidth: 360,
    borderRadius: 18, borderWidth: 1,
    padding: 28, alignItems: 'center', gap: 10,
  },
  fusionTitle: { fontSize: 20, fontWeight: '800', letterSpacing: 0.5 },
  fusionSubtitle: { fontSize: 14, marginBottom: 4 },
  gaugeTrack: {
    width: '100%', height: 14, borderRadius: 7,
    overflow: 'hidden', marginTop: 8,
  },
  gaugeFill: { height: '100%', borderRadius: 7 },
  resultRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: 12, width: '100%',
  },
  resultText: { fontSize: 14, fontWeight: '600', flex: 1 },
  rewardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  rewardDot: { width: 10, height: 10, borderRadius: 5 },
  rewardText: { fontSize: 16, fontWeight: '700' },
  doneBtn: {
    paddingHorizontal: 32, paddingVertical: 12,
    borderRadius: 12, marginTop: 8,
  },
  doneBtnText: { fontSize: 15, fontWeight: '800', color: '#0D0A07' },
});
