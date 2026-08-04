/**
 * GemForgeModal — Atelier des Pierres
 * Système complet de fabrication, fusion et collection de pierres forgées.
 *
 * Hermes hoisting rule: sub-components with hooks defined BEFORE the main component.
 */
import React, {
  useState,
  useRef,
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
  Animated,
  Easing,
  ScrollView,
} from 'react-native';
import Feather from '@/components/Feather';
import { useGame } from '@/context/GameContext';
import type { CraftedGem, GemData } from '@/types/game';

// ── Constants ─────────────────────────────────────────────────────────────────

const QUALITY_COLORS: Record<string, string> = {
  failed: '#666666', basic: '#AAAAAA', decent: '#88CC88', good: '#4488FF',
  excellent: '#AA44FF', perfect: '#FFAA00', masterwork: '#FF4444',
};
const QUALITY_LABELS: Record<string, string> = {
  failed: 'Raté', basic: 'Médiocre', decent: 'Acceptable', good: 'Bon',
  excellent: 'Excellent', perfect: 'Parfait', masterwork: "Chef-d'œuvre",
};
const RARITY_COLORS: Record<string, string> = {
  common: '#AAAAAA', uncommon: '#44FF44', rare: '#4488FF',
  epic: '#AA44FF', legendary: '#FFAA00', mythic: '#FF4444',
};
const RARITY_LABELS: Record<string, string> = {
  common: 'Commun', uncommon: 'Peu commun', rare: 'Rare',
  epic: 'Épique', legendary: 'Légendaire', mythic: 'Mythique',
};
const CATEGORY_LABELS: Record<string, string> = {
  all: 'Tout', gem: 'Gemmes', rune: 'Runes', jewel: 'Joyaux',
};

// Strike mini-game timing
const STRIKE_DURATION_MS = 1600;
const PERFECT_WINDOW_MS = 150;
const GOOD_WINDOW_MS = 320;
const OK_WINDOW_MS = 580;

// ── Types ─────────────────────────────────────────────────────────────────────

type CraftPhase = 'select' | 'striking' | 'result';
type ModalTab = 'craft' | 'fuse' | 'collection';
type CategoryFilter = 'all' | 'gem' | 'rune' | 'jewel';

// ── Sub-component: Strike mini-game ───────────────────────────────────────────
// Must be defined BEFORE GemForgeModal (Hermes hoisting rule)

interface StrikingPhaseProps {
  numStrikes: number;
  onComplete: (totalScore: number) => void;
}

function StrikingPhase({ numStrikes, onComplete }: StrikingPhaseProps) {
  const [strikeIndex, setStrikeIndex] = useState(0);
  const [results, setResults] = useState<{ label: string; color: string }[]>([]);
  const [cumScore, setCumScore] = useState(0);
  const startRef = useRef<number>(0);
  const ringAnim = useRef(new Animated.Value(0)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);
  const doneRef = useRef(false);

  const startAnim = useCallback(() => {
    startRef.current = Date.now();
    ringAnim.setValue(0);
    animRef.current = Animated.timing(ringAnim, {
      toValue: 1,
      duration: STRIKE_DURATION_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animRef.current.start(({ finished }) => {
      if (finished && startRef.current > 0 && !doneRef.current) handleStrike();
    });
  }, [ringAnim]);

  useEffect(() => {
    startAnim();
    return () => { animRef.current?.stop(); };
  }, [strikeIndex]);

  const handleStrike = useCallback(() => {
    if (startRef.current === 0 || doneRef.current) return;
    animRef.current?.stop();
    const elapsed = Date.now() - startRef.current;
    startRef.current = 0;

    const diff = Math.abs(elapsed - STRIKE_DURATION_MS / 2);
    let score: number;
    let label: string;
    let color: string;
    if (diff <= PERFECT_WINDOW_MS) {
      score = 100; label = 'PARFAIT !'; color = '#FFAA00';
    } else if (diff <= GOOD_WINDOW_MS) {
      score = 70; label = 'BIEN !'; color = '#44FF44';
    } else if (diff <= OK_WINDOW_MS) {
      score = 40; label = 'OK'; color = '#4488FF';
    } else {
      score = 0; label = 'RATÉ'; color = '#FF4444';
    }

    const newResults = [...results, { label, color }];
    const newScore = cumScore + score;
    setResults(newResults);
    setCumScore(newScore);

    const next = strikeIndex + 1;
    if (next >= numStrikes) {
      doneRef.current = true;
      const final = Math.round(newScore / numStrikes);
      setTimeout(() => onComplete(final), 450);
    } else {
      setTimeout(() => setStrikeIndex(next), 300);
    }
  }, [strikeIndex, results, cumScore, numStrikes, onComplete]);

  const ringScale = ringAnim.interpolate({
    inputRange: [0, 0.42, 0.58, 1],
    outputRange: [2.2, 1.08, 0.92, 0.15],
  });
  const sweetGlow = ringAnim.interpolate({
    inputRange: [0, 0.38, 0.5, 0.62, 1],
    outputRange: [0.2, 0.4, 1.0, 0.4, 0.2],
  });

  return (
    <View style={sf.strikeContainer}>
      <Text style={sf.strikeLabel}>Frappe {strikeIndex + 1} / {numStrikes}</Text>

      <View style={sf.strikeResultsRow}>
        {results.map((r, i) => (
          <Text key={i} style={[sf.strikeResultBadge, { color: r.color }]}>{r.label}</Text>
        ))}
      </View>

      <View style={sf.ringWrap}>
        {/* Sweet spot (static ring) */}
        <Animated.View style={[sf.sweetSpotGlow, { opacity: sweetGlow }]} />
        <View style={sf.sweetSpot} />
        {/* Moving ring */}
        <Animated.View style={[sf.ring, { transform: [{ scale: ringScale }] }]} />
      </View>

      <TouchableOpacity style={sf.strikeBtn} onPress={handleStrike} activeOpacity={0.75}>
        <Feather name="tool" size={24} color="#FFD700" />
        <Text style={sf.strikeBtnText}>FRAPPER !</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Helper: Crafted gem card ──────────────────────────────────────────────────

function CraftedGemCard({ gem, compact }: { gem: CraftedGem; compact?: boolean }) {
  const qualityColor = QUALITY_COLORS[gem.craftQuality] ?? '#888';
  const rarityColor = RARITY_COLORS[gem.rarity] ?? '#888';
  return (
    <View style={[sf.gemCard, { borderColor: qualityColor }]}>
      <View style={sf.gemCardHeader}>
        <View style={[sf.gemIconCircle, { backgroundColor: gem.color + '33' }]}>
          <Feather name="hexagon" size={20} color={gem.color ?? rarityColor} />
        </View>
        <View style={sf.gemCardMeta}>
          <Text style={[sf.gemCardName, { color: rarityColor }]} numberOfLines={1}>
            {gem.name}{gem.affix ? ` ${gem.affix}` : ''}
          </Text>
          <View style={sf.gemCardBadges}>
            <View style={[sf.qBadge, { borderColor: qualityColor, backgroundColor: qualityColor + '22' }]}>
              <Text style={[sf.qBadgeText, { color: qualityColor }]}>{QUALITY_LABELS[gem.craftQuality]}</Text>
            </View>
            <Text style={[sf.rarityBadge, { color: rarityColor }]}>{RARITY_LABELS[gem.rarity] ?? gem.rarity}</Text>
          </View>
        </View>
      </View>

      {!compact && (
        <>
          <View style={sf.statsList}>
            {Object.entries(gem.craftedStats ?? {})
              .filter(([, v]) => v > 0)
              .map(([stat, val]) => {
                const range = gem.statRanges?.find(r => r.stat === stat);
                return (
                  <View key={stat} style={sf.statRow}>
                    <Text style={sf.statLabel}>{range?.label ?? stat}</Text>
                    <Text style={sf.statVal}>+{val}{range?.unit ?? ''}</Text>
                  </View>
                );
              })}
          </View>
          {gem.specialEffect && (
            <View style={sf.specialRow}>
              <Feather name="zap" size={12} color="#FFAA00" />
              <Text style={sf.specialLabel}> {gem.specialEffect.label}</Text>
              <Text style={sf.specialVal}>+{gem.specialEffect.value}%</Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface GemForgeModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function GemForgeModal({ visible, onClose }: GemForgeModalProps) {
  const game = useGame();

  const [activeTab, setActiveTab] = useState<ModalTab>('craft');
  const [craftPhase, setCraftPhase] = useState<CraftPhase>('select');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [selectedGemId, setSelectedGemId] = useState<string | null>(null);
  const [lastCraftedGem, setLastCraftedGem] = useState<CraftedGem | null>(null);
  const [lastScore, setLastScore] = useState(0);

  // Fusion state
  const [fuseTypeId, setFuseTypeId] = useState<string | null>(null);
  const [fuseResult, setFuseResult] = useState<{ success: boolean; gem?: CraftedGem } | null>(null);
  const [fusePending, setFusePending] = useState(false);

  const allGems: GemData[] = (game.allGems ?? []);
  const craftedGems: CraftedGem[] = game.craftedGems ?? [];

  const filteredTemplates = useMemo(
    () => allGems.filter(g => categoryFilter === 'all' || g.category === categoryFilter),
    [allGems, categoryFilter],
  );

  const selectedTemplate = useMemo(
    () => allGems.find(g => g.id === selectedGemId) ?? null,
    [allGems, selectedGemId],
  );

  const canAffordSelected = useMemo(() => {
    if (!selectedTemplate?.recipe) return false;
    return selectedTemplate.recipe.every(ing => {
      const qty = game.inventory.find(i => i.resourceId === ing.resourceId)?.quantity ?? 0;
      return qty >= ing.quantity;
    });
  }, [selectedTemplate, game.inventory]);

  const numStrikes = useMemo(() => {
    if (!selectedTemplate) return 3;
    if (selectedTemplate.category === 'jewel') return 5;
    if (selectedTemplate.category === 'rune') return 4;
    return selectedTemplate.level >= 3 ? 4 : 3;
  }, [selectedTemplate]);

  // Groups of 3+ identical-type craftedGems for fusion
  const fusableGroups = useMemo(() => {
    const map = new Map<string, CraftedGem[]>();
    for (const gem of craftedGems) {
      if (!map.has(gem.type)) map.set(gem.type, []);
      map.get(gem.type)!.push(gem);
    }
    return Array.from(map.entries())
      .filter(([, gems]) => gems.length >= 3)
      .map(([type, gems]) => ({ type, gems }));
  }, [craftedGems]);

  const selectedFuseGroup = useMemo(
    () => fusableGroups.find(g => g.type === fuseTypeId) ?? null,
    [fusableGroups, fuseTypeId],
  );

  function resourceName(id: string) {
    return game.allResources?.find(r => r.id === id)?.name ?? id;
  }

  function handleStartCraft() {
    if (!selectedGemId || !canAffordSelected) return;
    setCraftPhase('striking');
  }

  function handleStrikeComplete(score: number) {
    if (!selectedGemId) return;
    setLastScore(score);
    const gem = game.craftGem(selectedGemId, score);
    if (gem) setLastCraftedGem(gem);
    setCraftPhase('result');
  }

  function handleCollect() {
    setCraftPhase('select');
    setLastCraftedGem(null);
  }

  function handleFuse() {
    if (!selectedFuseGroup || fusePending) return;
    setFusePending(true);
    const ids = selectedFuseGroup.gems.slice(0, 3).map(g => g.instanceId);
    setTimeout(() => {
      const result = game.fuseGems(ids);
      setFuseResult(result);
      setFuseTypeId(null);
      setFusePending(false);
    }, 700);
  }

  function handleClose() {
    setCraftPhase('select');
    setLastCraftedGem(null);
    setFuseResult(null);
    setFuseTypeId(null);
    onClose();
  }

  // ── Render: Select phase ──────────────────────────────────────────────────

  function renderSelectPhase() {
    return (
      <View style={sf.phase}>
        {/* Category filter */}
        <View style={sf.catRow}>
          {(['all', 'gem', 'rune', 'jewel'] as CategoryFilter[]).map(cat => (
            <TouchableOpacity
              key={cat}
              style={[sf.catPill, categoryFilter === cat && sf.catPillActive]}
              onPress={() => { setCategoryFilter(cat); setSelectedGemId(null); }}>
              <Text style={[sf.catPillTxt, categoryFilter === cat && sf.catPillTxtActive]}>
                {CATEGORY_LABELS[cat]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView style={sf.recipeList} showsVerticalScrollIndicator={false}>
          {filteredTemplates.map(gem => {
            const canAfford = (gem.recipe ?? []).every(ing => {
              const qty = game.inventory.find(i => i.resourceId === ing.resourceId)?.quantity ?? 0;
              return qty >= ing.quantity;
            });
            const rarityColor = RARITY_COLORS[gem.rarity] ?? '#888';
            const sel = selectedGemId === gem.id;
            return (
              <TouchableOpacity
                key={gem.id}
                style={[sf.recipeCard, sel && sf.recipeCardSel, !canAfford && sf.recipeCardDim]}
                onPress={() => setSelectedGemId(gem.id)}>
                <View style={[sf.recipeIconCircle, { backgroundColor: gem.color + '33' }]}>
                  <Feather name="hexagon" size={18} color={gem.color ?? rarityColor} />
                </View>
                <View style={sf.recipeInfo}>
                  <Text style={[sf.recipeName, { color: rarityColor }]}>{gem.name}</Text>
                  <Text style={sf.recipeLevel}>Niveau {gem.level} — {RARITY_LABELS[gem.rarity] ?? gem.rarity}</Text>
                  <View style={sf.ingredients}>
                    {(gem.recipe ?? []).map(ing => {
                      const owned = game.inventory.find(i => i.resourceId === ing.resourceId)?.quantity ?? 0;
                      return (
                        <Text key={ing.resourceId} style={[sf.ingredientTxt, owned < ing.quantity && sf.ingredientMissing]}>
                          {resourceName(ing.resourceId)} ×{ing.quantity} ({owned})
                        </Text>
                      );
                    })}
                  </View>
                </View>
                <Feather
                  name={canAfford ? 'check-circle' : 'x-circle'}
                  size={18}
                  color={canAfford ? '#44FF44' : '#FF4444'}
                />
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <TouchableOpacity
          style={[sf.ctaBtn, (!selectedGemId || !canAffordSelected) && sf.ctaBtnDim]}
          disabled={!selectedGemId || !canAffordSelected}
          onPress={handleStartCraft}>
          <Feather name="tool" size={18} color="#FFD700" />
          <Text style={sf.ctaBtnTxt}>
            {!selectedGemId
              ? 'Sélectionner une recette'
              : !canAffordSelected
              ? 'Ingrédients manquants'
              : 'Commencer la forge'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render: Result phase ──────────────────────────────────────────────────

  function renderResultPhase() {
    if (!lastCraftedGem) return null;
    const qColor = QUALITY_COLORS[lastCraftedGem.craftQuality] ?? '#888';
    const emoji = lastScore >= 85 ? '🌟' : lastScore >= 55 ? '✅' : lastScore >= 20 ? '⚠️' : '❌';
    const label = lastScore >= 85 ? 'Forge Exceptionnelle !' : lastScore >= 55 ? 'Forge Réussie' : lastScore >= 20 ? 'Résultat Médiocre' : 'Forge Ratée';
    return (
      <View style={sf.phase}>
        <Text style={sf.resultTitle}>{emoji} {label}</Text>
        <Text style={[sf.scoreText, { color: qColor }]}>
          Score : {lastScore}/100 — {QUALITY_LABELS[lastCraftedGem.craftQuality]}
        </Text>
        <CraftedGemCard gem={lastCraftedGem} />
        <TouchableOpacity style={[sf.ctaBtn, { borderColor: qColor, backgroundColor: qColor + '22' }]} onPress={handleCollect}>
          <Feather name="plus-square" size={18} color={qColor} />
          <Text style={[sf.ctaBtnTxt, { color: qColor }]}>Ajouter à la collection</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Render: Fusion tab ────────────────────────────────────────────────────

  function renderFuseTab() {
    return (
      <View style={sf.phase}>
        <Text style={sf.sectionTitle}>Fusionner 3 pierres identiques</Text>
        <Text style={sf.sectionSub}>pour obtenir une pierre de niveau supérieur</Text>

        {fuseResult && (
          <View style={[sf.fuseResult, { borderColor: fuseResult.success ? '#44FF44' : '#FF4444' }]}>
            <Text style={[sf.fuseResultTitle, { color: fuseResult.success ? '#44FF44' : '#FF4444' }]}>
              {fuseResult.success ? '✨ Fusion réussie !' : '💥 Fusion échouée — les 3 pierres sont perdues.'}
            </Text>
            {fuseResult.gem && <CraftedGemCard gem={fuseResult.gem} />}
            <TouchableOpacity style={sf.clearBtn} onPress={() => setFuseResult(null)}>
              <Text style={sf.clearBtnTxt}>OK</Text>
            </TouchableOpacity>
          </View>
        )}

        {fusableGroups.length === 0 && !fuseResult && (
          <Text style={sf.emptyTxt}>Aucun groupe de 3 pierres identiques dans votre collection.</Text>
        )}

        <ScrollView style={sf.fuseList} showsVerticalScrollIndicator={false}>
          {fusableGroups.map(({ type, gems }) => {
            const t = gems[0];
            const rarityColor = RARITY_COLORS[t.rarity] ?? '#888';
            const sel = fuseTypeId === type;
            return (
              <TouchableOpacity
                key={type}
                style={[sf.recipeCard, sel && sf.recipeCardSel]}
                onPress={() => setFuseTypeId(sel ? null : type)}>
                <View style={[sf.recipeIconCircle, { backgroundColor: (t.color ?? '#888') + '33' }]}>
                  <Feather name="hexagon" size={18} color={t.color ?? rarityColor} />
                </View>
                <View style={sf.recipeInfo}>
                  <Text style={[sf.recipeName, { color: rarityColor }]}>{t.name}</Text>
                  <Text style={sf.recipeLevel}>{gems.length} disponibles — Taux : {Math.round((t.fuseSuccessRate ?? 0.5) * 100)}%</Text>
                </View>
                {sel && <Feather name="check-circle" size={18} color="#44FF44" />}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {fuseTypeId && selectedFuseGroup && (
          <TouchableOpacity
            style={[sf.ctaBtn, fusePending && sf.ctaBtnDim]}
            disabled={fusePending}
            onPress={handleFuse}>
            <Feather name="edit-3" size={18} color="#FFD700" />
            <Text style={sf.ctaBtnTxt}>
              {fusePending ? 'Fusion en cours…' : `Fusionner 3 ${selectedFuseGroup.gems[0].name}`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── Render: Collection tab ────────────────────────────────────────────────

  function renderCollectionTab() {
    return (
      <ScrollView style={sf.phase} showsVerticalScrollIndicator={false} contentContainerStyle={sf.collectionContent}>
        {craftedGems.length === 0 && (
          <Text style={sf.emptyTxt}>Votre collection est vide.{'\n'}Forgez vos premières gemmes !</Text>
        )}
        {craftedGems.map(gem => (
          <CraftedGemCard key={gem.instanceId} gem={gem} />
        ))}
      </ScrollView>
    );
  }

  // ── Root render ───────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={sf.overlay}>
        <View style={sf.sheet}>
          {/* Header */}
          <View style={sf.header}>
            <View style={sf.headerLeft}>
              <Feather name="hexagon" size={20} color="#FFD700" />
              <Text style={sf.headerTitle}>Atelier des Pierres</Text>
            </View>
            <TouchableOpacity style={sf.closeBtn} onPress={handleClose}>
              <Feather name="x" size={22} color="#AAA" />
            </TouchableOpacity>
          </View>

          {/* Tab bar */}
          <View style={sf.tabBar}>
            {([
              ['craft', 'Fabriquer'],
              ['fuse', 'Fusionner'],
              [`collection`, `Collection (${craftedGems.length})`],
            ] as [ModalTab, string][]).map(([tab, label]) => (
              <TouchableOpacity
                key={tab}
                style={[sf.tabBtn, activeTab === tab && sf.tabBtnActive]}
                onPress={() => { setActiveTab(tab as ModalTab); setCraftPhase('select'); }}>
                <Text style={[sf.tabBtnTxt, activeTab === tab && sf.tabBtnTxtActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Content */}
          <View style={sf.content}>
            {activeTab === 'craft' && craftPhase === 'select' && renderSelectPhase()}
            {activeTab === 'craft' && craftPhase === 'striking' && (
              <StrikingPhase numStrikes={numStrikes} onComplete={handleStrikeComplete} />
            )}
            {activeTab === 'craft' && craftPhase === 'result' && renderResultPhase()}
            {activeTab === 'fuse' && renderFuseTab()}
            {activeTab === 'collection' && renderCollectionTab()}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const sf = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#12121E',
    borderTopLeftRadius: 22, borderTopRightRadius: 22,
    maxHeight: '92%', minHeight: '65%',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 16, borderBottomWidth: 1, borderBottomColor: '#2A2A40',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#FFD700', letterSpacing: 0.5 },
  closeBtn: { padding: 4 },

  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#2A2A40' },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: '#FFD700' },
  tabBtnTxt: { fontSize: 12, color: '#666' },
  tabBtnTxtActive: { color: '#FFD700', fontWeight: '600' },

  content: { flex: 1 },
  phase: { flex: 1, padding: 14 },
  collectionContent: { paddingBottom: 20 },

  // Category filter
  catRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  catPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: '#1E1E30', borderWidth: 1, borderColor: '#333' },
  catPillActive: { backgroundColor: '#FFD70022', borderColor: '#FFD700' },
  catPillTxt: { color: '#666', fontSize: 12 },
  catPillTxtActive: { color: '#FFD700', fontWeight: '600' },

  // Recipe cards
  recipeList: { flex: 1, marginBottom: 10 },
  recipeCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1A1A2C', borderRadius: 10, padding: 10,
    marginBottom: 8, borderWidth: 1, borderColor: '#2A2A3E', gap: 10,
  },
  recipeCardSel: { borderColor: '#FFD700', backgroundColor: '#22223A' },
  recipeCardDim: { opacity: 0.5 },
  recipeIconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  recipeInfo: { flex: 1 },
  recipeName: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  recipeLevel: { fontSize: 10, color: '#666', marginBottom: 4 },
  ingredients: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  ingredientTxt: { fontSize: 10, color: '#888', backgroundColor: '#252535', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2 },
  ingredientMissing: { color: '#FF6666' },

  // CTA button
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#FFD70015', borderWidth: 1, borderColor: '#FFD700',
    borderRadius: 10, padding: 13,
  },
  ctaBtnDim: { opacity: 0.4 },
  ctaBtnTxt: { color: '#FFD700', fontSize: 14, fontWeight: '700' },

  // Strike mini-game
  strikeContainer: { flex: 1, alignItems: 'center', justifyContent: 'space-between', paddingVertical: 20 },
  strikeLabel: { fontSize: 18, color: '#FFD700', fontWeight: '700' },
  strikeResultsRow: { flexDirection: 'row', gap: 8, minHeight: 22 },
  strikeResultBadge: { fontSize: 13, fontWeight: '700' },
  ringWrap: { width: 200, height: 200, alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute', width: 120, height: 120, borderRadius: 60,
    borderWidth: 3, borderColor: '#FFD700',
  },
  sweetSpot: {
    width: 46, height: 46, borderRadius: 23,
    borderWidth: 2, borderColor: '#44FF44', borderStyle: 'dashed',
    backgroundColor: '#44FF4410',
  },
  sweetSpotGlow: {
    position: 'absolute', width: 46, height: 46, borderRadius: 23,
    backgroundColor: '#44FF4440',
  },
  strikeBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#FFD70018', borderWidth: 2, borderColor: '#FFD700',
    borderRadius: 50, paddingHorizontal: 36, paddingVertical: 16,
  },
  strikeBtnText: { color: '#FFD700', fontSize: 18, fontWeight: '800' },

  // Result
  resultTitle: { fontSize: 17, color: '#FFF', fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  scoreText: { fontSize: 13, textAlign: 'center', marginBottom: 14, fontWeight: '600' },

  // Gem card
  gemCard: {
    backgroundColor: '#1A1A2C', borderRadius: 10, borderWidth: 1.5,
    padding: 12, marginBottom: 10,
  },
  gemCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  gemIconCircle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  gemCardMeta: { flex: 1 },
  gemCardName: { fontSize: 13, fontWeight: '700', marginBottom: 4 },
  gemCardBadges: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  qBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1 },
  qBadgeText: { fontSize: 10, fontWeight: '600' },
  rarityBadge: { fontSize: 10 },
  statsList: { gap: 3 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statLabel: { fontSize: 11, color: '#888' },
  statVal: { fontSize: 11, color: '#FFF', fontWeight: '600' },
  specialRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#2A2A3E' },
  specialLabel: { flex: 1, fontSize: 11, color: '#FFAA00' },
  specialVal: { fontSize: 11, color: '#FFAA00', fontWeight: '600' },

  // Fusion
  sectionTitle: { fontSize: 15, color: '#FFF', fontWeight: '700', marginBottom: 2 },
  sectionSub: { fontSize: 11, color: '#666', marginBottom: 12 },
  fuseResult: { borderRadius: 10, borderWidth: 1.5, padding: 12, marginBottom: 12 },
  fuseResultTitle: { fontSize: 13, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  clearBtn: { alignSelf: 'center', marginTop: 8, paddingHorizontal: 20, paddingVertical: 6, backgroundColor: '#252535', borderRadius: 8 },
  clearBtnTxt: { color: '#FFF', fontWeight: '600', fontSize: 13 },
  fuseList: { flex: 1, marginBottom: 10 },
  emptyTxt: { color: '#444', textAlign: 'center', marginTop: 40, fontSize: 14, lineHeight: 22 },
});
