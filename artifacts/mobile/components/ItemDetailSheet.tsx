/**
 * ItemDetailSheet — Full 90%-height bottom sheet for a crafted item.
 * Sections: 3D model | quality/name/lore | stats | gem slots | meta | materials
 */
import React, { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Feather from '@/components/Feather';
import { LinearGradient } from '@/lib/LinearGradientSafe';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useGame } from '@/context/GameContext';
import { useColors } from '@/hooks/useColors';
import type { CraftedGem, GemData, Item, Quality } from '@/types/game';
import ItemModel3D from './ItemModel3D';

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
    case 'legendary': return 'LÉGENDAIRE ✦';
    case 'excellent': return 'EXCELLENT';
    case 'good': return 'BON';
    case 'normal': return 'NORMAL';
    case 'poor': return 'MÉDIOCRE';
  }
}

function rarityLabel(r: string): string {
  const map: Record<string, string> = {
    legendary: 'Légendaire', epic: 'Épique', rare: 'Rare',
    uncommon: 'Peu commun', common: 'Commun',
  };
  return map[r] ?? r;
}

function categoryLabel(c: string): string {
  const map: Record<string, string> = {
    sword: 'Épée', axe: 'Hache', hammer: 'Marteau', lance: 'Lance',
    shield: 'Bouclier', armor: 'Armure', helmet: 'Casque', ring: 'Anneau',
    amulet: 'Amulette', tool: 'Outil', decoration: 'Décoration',
  };
  return map[c] ?? c;
}

// ─── Gem socket circle ────────────────────────────────────────────────────────
function GemSocket({
  gem,
  onPress,
  colors,
}: {
  gem: GemData | null;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      style={[
        styles.gemSocket,
        {
          backgroundColor: gem ? gem.color + '28' : colors.secondary,
          borderColor: gem ? gem.color : colors.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {gem ? (
        <>
          <View style={[styles.gemDot, { backgroundColor: gem.color }]} />
          <Text style={[styles.gemSocketName, { color: gem.color }]} numberOfLines={1}>
            {gem.name}
          </Text>
        </>
      ) : (
        <Feather name="plus" size={18} color={colors.mutedForeground} />
      )}
    </TouchableOpacity>
  );
}

// ─── Gem picker ───────────────────────────────────────────────────────────────
function GemPicker({
  visible,
  onClose,
  onSelect,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (gem: GemData) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const game = useGame();
  const socketable = game.getSocketableGems();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent>
      <View style={styles.pickerOverlay}>
        <View style={[styles.pickerSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.handle, { backgroundColor: colors.muted }]} />
          <View style={styles.pickerHeader}>
            <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Choisir une gemme</Text>
            <TouchableOpacity onPress={onClose}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          {socketable.length === 0 ? (
            <View style={styles.pickerEmpty}>
              <Feather name="hexagon" size={32} color={colors.mutedForeground} />
              <Text style={[styles.pickerEmptyText, { color: colors.mutedForeground }]}>
                Aucune gemme dans l'inventaire.{'\n'}Explorez le monde pour en trouver.
              </Text>
            </View>
          ) : (
            <FlatList
              data={socketable}
              keyExtractor={(g) => ('instanceId' in g ? (g as unknown as CraftedGem).instanceId : g.id)}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
              renderItem={({ item: gem }) => {
                const isCrafted = 'instanceId' in gem;
                const qty = isCrafted ? 0 : game.getInventoryQty(gem.type);
                return (
                  <TouchableOpacity
                    style={[styles.gemRow, { backgroundColor: colors.secondary, borderColor: gem.color + '50' }]}
                    onPress={() => onSelect(gem)}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.gemRowDot, { backgroundColor: gem.color }]} />
                    <View style={styles.gemRowInfo}>
                      <Text style={[styles.gemRowName, { color: colors.foreground }]}>{gem.name}</Text>
                      <Text style={[styles.gemRowRarity, { color: gem.color }]}>
                        {rarityLabel(gem.rarity)} · Niv.{gem.level}
                        {isCrafted && ` — ${(gem as unknown as CraftedGem).craftQuality ?? ''}`}
                      </Text>
                      <View style={styles.gemEffects}>
                        {(gem.effects ?? []).map((eff) => (
                          <Text key={eff} style={[styles.gemEffect, { color: colors.accent }]}>
                            {eff}
                          </Text>
                        ))}
                      </View>
                    </View>
                    <View style={[styles.qtyBadge, { backgroundColor: colors.card }]}>
                      {isCrafted
                        ? <Feather name="star" size={14} color={gem.color} />
                        : <Text style={[styles.qtyText, { color: colors.accent }]}>x{qty}</Text>
                      }
                    </View>
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface Props {
  /** Pass the instanceId — component derives live item from context each render. */
  itemInstanceId: string | null;
  onClose: () => void;
}

export default function ItemDetailSheet({ itemInstanceId, onClose }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const game = useGame();
  const [pendingSlot, setPendingSlot] = useState<number | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<number | null>(null);

  // Always derive live item from context — never cache a snapshot
  const item = itemInstanceId
    ? game.craftedItems.find((i) => i.instanceId === itemInstanceId) ?? null
    : null;

  if (!item) return null;

  const qColor = qualityColor(item.quality, colors);
  const primaryMat = item.materials[0];
  const bottomPad = insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 12;

  // Gem bonus summary
  const gemBonuses = item.gems
    .filter(Boolean)
    .flatMap((g) => (g as GemData).effects);

  const handleSocketPress = (slotIndex: number) => {
    const slot = item.gems[slotIndex];
    if (slot) {
      setShowRemoveConfirm(slotIndex);
    } else {
      setPendingSlot(slotIndex);
      setShowPicker(true);
    }
  };

  const handleSelectGem = (gem: GemData) => {
    if (pendingSlot === null) return;
    setShowPicker(false);
    // CraftedGems (from the gem forge) have an instanceId — route to the correct callback
    const isCraftedGem = 'instanceId' in gem && typeof (gem as unknown as CraftedGem).instanceId === 'string';
    const ok = isCraftedGem
      ? game.socketCraftedGem(item.instanceId, pendingSlot, gem as unknown as CraftedGem)
      : game.socketGem(item.instanceId, pendingSlot, gem);
    if (ok) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPendingSlot(null);
  };

  const handleRemoveGem = (slotIndex: number) => {
    setShowRemoveConfirm(null);
    game.removeGem(item.instanceId, slotIndex);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleMelt = () => {
    const result = game.meltItem(item.instanceId);
    if (!result.success) {
      Alert.alert('Fonte impossible', result.message);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const recoveredLabel = result.recovered
      .map((drop) => `${drop.quantity} ${game.getResourceById(drop.resourceId)?.name ?? drop.resourceId}`)
      .join(', ');
    Alert.alert('Objet recyclé', `Matériaux récupérés : ${recoveredLabel}.`);
    onClose();
  };

  const durPct = item.maxDurability > 0 ? item.durability / item.maxDurability : 0;
  const durColor = durPct > 0.6 ? '#4CAF50' : durPct > 0.3 ? colors.primary : colors.destructive;

  return (
    <>
      <Modal visible={!!item} transparent animationType="slide" statusBarTranslucent>
        <View style={styles.overlay}>
          <View
            style={[
              styles.sheet,
              { backgroundColor: colors.card, borderColor: qColor },
            ]}
          >
            {/* Handle */}
            <View style={[styles.handle, { backgroundColor: colors.muted }]} />

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: bottomPad }}
            >
              {/* 3D Model */}
              <View style={[styles.modelContainer, { backgroundColor: colors.background }]}>
                <ItemModel3D item={item} primaryMaterialId={primaryMat} height={210} />
                <LinearGradient
                  colors={['transparent', colors.card as string]}
                  style={styles.modelGradient}
                  pointerEvents="none"
                />
              </View>

              <View style={styles.content}>
                {/* Quality + name */}
                <View style={[styles.qualityBar, { backgroundColor: qColor }]} />
                <Text style={[styles.qualityLabel, { color: qColor }]}>
                  {qualityLabel(item.quality)}
                </Text>
                <Text style={[styles.itemName, { color: colors.foreground }]}>{item.name}</Text>
                <Text style={[styles.categoryLabel, { color: colors.mutedForeground }]}>
                  {categoryLabel(item.category)} · {rarityLabel(item.rarity)} · Niv.{item.level}
                </Text>

                {/* Enigma mastery stamp */}
                {item.enigmaMastered && (
                  <View style={styles.enigmaStamp}>
                    <Feather name="star" size={13} color="#C084FC" />
                    <Text style={styles.enigmaStampText}>Forgé avec Maîtrise — défi d'énigme réussi</Text>
                  </View>
                )}

                <Text style={[styles.description, { color: colors.mutedForeground }]}>
                  {item.description}
                </Text>
                {item.lore ? (
                  <Text style={[styles.lore, { color: colors.mutedForeground }]}>
                    « {item.lore} »
                  </Text>
                ) : null}

                {/* Unique traits */}
                {item.unique && (
                  <>
                    <SectionLabel label="PIÈCE UNIQUE ✦" color={item.unique.steelTint} />
                    <View style={[styles.uniqueCard, { borderColor: item.unique.steelTint + '55', backgroundColor: colors.card }]}>
                      <View style={styles.uniqueRow}>
                        <View style={[styles.tintSwatch, { backgroundColor: item.unique.steelTint }]} />
                        <Text style={[styles.uniqueTrait, { color: colors.foreground }]}>
                          {item.unique.form} · {item.unique.fitting}
                        </Text>
                      </View>
                      <Text style={[styles.uniqueTrait, { color: colors.mutedForeground }]}>
                        Prise : {item.unique.grip}
                      </Text>
                      <Text style={[styles.uniqueEngraving, { color: colors.mutedForeground }]}>
                        Gravure : {item.unique.engraving}
                      </Text>
                      <Text style={[styles.uniqueSeed, { color: colors.mutedForeground }]}>
                        Empreinte de forge nº {item.unique.seed.toString(16).toUpperCase().padStart(8, '0')}
                      </Text>
                    </View>
                  </>
                )}

                {/* Stats */}
                {Object.keys(item.stats).length > 0 && (
                  <>
                    <SectionLabel label="STATISTIQUES" color={colors.primary} />
                    <View style={styles.statsGrid}>
                      {item.stats.attack !== undefined && (
                        <StatChip label="ATQ" value={item.stats.attack} colors={colors} />
                      )}
                      {item.stats.defense !== undefined && (
                        <StatChip label="DEF" value={item.stats.defense} colors={colors} />
                      )}
                      {item.stats.magic !== undefined && (
                        <StatChip label="MAG" value={item.stats.magic} colors={colors} />
                      )}
                      {item.stats.speed !== undefined && (
                        <StatChip label="VIT" value={item.stats.speed} colors={colors} />
                      )}
                      {item.stats.luck !== undefined && (
                        <StatChip label="CHANCE" value={item.stats.luck} colors={colors} />
                      )}
                    </View>
                  </>
                )}

                {/* Durability */}
                <SectionLabel label="ÉTAT" color={colors.primary} />
                <View style={styles.durRow}>
                  <View style={[styles.durTrack, { backgroundColor: colors.muted }]}>
                    <View
                      style={[
                        styles.durFill,
                        { width: `${Math.round(durPct * 100)}%` as `${number}%`, backgroundColor: durColor },
                      ]}
                    />
                  </View>
                  <Text style={[styles.durText, { color: durColor }]}>
                    {item.durability}/{item.maxDurability}
                  </Text>
                </View>

                {/* Meta row */}
                <View style={styles.metaRow}>
                  <MetaChip icon="package" label="Poids" value={`${item.weight} kg`} colors={colors} />
                  <MetaChip icon="dollar-sign" label="Valeur" value={`${item.value} or`} colors={colors} />
                  <MetaChip icon="award" label="Score" value={`${item.qualityScore}/100`} colors={colors} />
                </View>

                {/* Gem slots */}
                {item.gemSlots > 0 && (
                  <>
                    <SectionLabel label={`GEMMES  (${item.gems.filter(Boolean).length}/${item.gemSlots})`} color={colors.accent} />
                    <View style={styles.slotsRow}>
                      {Array.from({ length: item.gemSlots }).map((_, i) => (
                        <GemSocket
                          key={i}
                          gem={item.gems[i] ?? null}
                          onPress={() => handleSocketPress(i)}
                          colors={colors}
                        />
                      ))}
                    </View>
                    {gemBonuses.length > 0 && (
                      <View style={[styles.gemBonusBox, { backgroundColor: colors.secondary }]}>
                        <Text style={[styles.gemBonusTitle, { color: colors.accent }]}>Bonus actifs:</Text>
                        {gemBonuses.map((b, i) => (
                          <Text key={i} style={[styles.gemBonusLine, { color: colors.foreground }]}>
                            ✦ {b}
                          </Text>
                        ))}
                      </View>
                    )}
                  </>
                )}

                {/* Materials */}
                <SectionLabel label="MATÉRIAUX" color={colors.primary} />
                <View style={styles.matsList}>
                  {item.materials.map((matId) => {
                    const res = game.getResourceById(matId);
                    return (
                      <View
                        key={matId}
                        style={[styles.matChip, { backgroundColor: colors.secondary, borderColor: res?.color ?? colors.border }]}
                      >
                        <View style={[styles.matDot, { backgroundColor: res?.color ?? colors.muted }]} />
                        <Text style={[styles.matName, { color: colors.foreground }]}>
                          {res?.name ?? matId}
                        </Text>
                      </View>
                    );
                  })}
                </View>

                {/* Craft info */}
                <SectionLabel label="HISTORIQUE" color={colors.primary} />
                <Text style={[styles.craftInfo, { color: colors.mutedForeground }]}>
                  Forgé par {item.craftedBy}
                </Text>
                <Text style={[styles.craftInfo, { color: colors.mutedForeground }]}>
                  {new Date(item.craftedAt).toLocaleDateString('fr-FR', {
                    year: 'numeric', month: 'long', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </Text>

                <TouchableOpacity
                  style={[styles.meltBtn, { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}66` }]}
                  onPress={() => Alert.alert(
                    'Fondre cet objet ?',
                    `La fonte supprimera définitivement « ${item.name} ». Une partie de ses matériaux sera récupérée selon sa qualité.`,
                    [
                      { text: 'Annuler', style: 'cancel' },
                      { text: 'Fondre', style: 'destructive', onPress: handleMelt },
                    ],
                  )}
                >
                  <Feather name="refresh-cw" size={16} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.meltTitle, { color: colors.primary }]}>Fondre / recycler</Text>
                    <Text style={[styles.meltDesc, { color: colors.mutedForeground }]}>
                      Récupérer une partie des matériaux de fabrication
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.primary} />
                </TouchableOpacity>

                {/* Close */}
                <TouchableOpacity
                  style={[styles.closeBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                  onPress={onClose}
                >
                  <Text style={[styles.closeBtnText, { color: colors.foreground }]}>Fermer</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Gem picker modal */}
      <GemPicker
        visible={showPicker}
        onClose={() => { setShowPicker(false); setPendingSlot(null); }}
        onSelect={handleSelectGem}
        colors={colors}
      />

      {/* Remove confirm */}
      <Modal visible={showRemoveConfirm !== null} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.confirmOverlay}>
          <View style={[styles.confirmBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {showRemoveConfirm !== null && item.gems[showRemoveConfirm] && (
              <>
                <View style={[styles.gemRowDot, { backgroundColor: (item.gems[showRemoveConfirm] as GemData).color, width: 32, height: 32, borderRadius: 16, alignSelf: 'center', marginBottom: 12 }]} />
                <Text style={[styles.confirmTitle, { color: colors.foreground }]}>
                  Retirer la {(item.gems[showRemoveConfirm] as GemData).name} ?
                </Text>
                <Text style={[styles.confirmDesc, { color: colors.mutedForeground }]}>
                  La gemme retournera dans votre inventaire.
                </Text>
                <View style={styles.confirmBtns}>
                  <TouchableOpacity
                    style={[styles.confirmBtn, { backgroundColor: colors.secondary }]}
                    onPress={() => setShowRemoveConfirm(null)}
                  >
                    <Text style={[styles.confirmBtnText, { color: colors.foreground }]}>Annuler</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmBtn, { backgroundColor: colors.destructive }]}
                    onPress={() => handleRemoveGem(showRemoveConfirm!)}
                  >
                    <Text style={[styles.confirmBtnText, { color: '#fff' }]}>Retirer</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text style={[styles.sectionLabel, { color }]}>{label}</Text>
  );
}

function StatChip({ label, value, colors }: { label: string; value: number; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.statChip, { backgroundColor: colors.secondary }]}>
      <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.accent }]}>+{value}</Text>
    </View>
  );
}

function MetaChip({ icon, label, value, colors }: { icon: string; label: string; value: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.metaChip, { backgroundColor: colors.secondary }]}>
      <Feather name={icon as any} size={12} color={colors.mutedForeground} />
      <View>
        <Text style={[styles.metaLabel, { color: colors.mutedForeground }]}>{label}</Text>
        <Text style={[styles.metaValue, { color: colors.foreground }]}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.88)', justifyContent: 'flex-end' },
  sheet: {
    height: '92%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modelContainer: { height: 210, width: '100%' },
  modelGradient: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 50 },
  content: { paddingHorizontal: 22 },
  qualityBar: { height: 3, borderRadius: 2, marginTop: 10, marginBottom: 10 },
  qualityLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 2.5, marginBottom: 5 },
  itemName: { fontSize: 26, fontWeight: '900', marginBottom: 3 },
  categoryLabel: { fontSize: 12, marginBottom: 8 },
  description: { fontSize: 13, lineHeight: 19, marginBottom: 8 },
  lore: { fontSize: 12, lineHeight: 18, fontStyle: 'italic', marginBottom: 18, opacity: 0.8 },
  uniqueCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 5 },
  uniqueRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tintSwatch: { width: 12, height: 12, borderRadius: 6 },
  uniqueTrait: { fontSize: 12, lineHeight: 17 },
  uniqueEngraving: { fontSize: 12, lineHeight: 17, fontStyle: 'italic' },
  uniqueSeed: { fontSize: 10, letterSpacing: 1, opacity: 0.6, marginTop: 3 },
  sectionLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 2, marginTop: 18, marginBottom: 10 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  statChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, alignItems: 'center', minWidth: 66 },
  statLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  statValue: { fontSize: 18, fontWeight: '800' },
  durRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  durTrack: { flex: 1, height: 7, borderRadius: 4, overflow: 'hidden' },
  durFill: { height: '100%', borderRadius: 4, minWidth: 3 },
  durText: { fontSize: 12, fontWeight: '600', minWidth: 60, textAlign: 'right' },
  metaRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  metaChip: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, borderRadius: 10 },
  metaLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 0.5 },
  metaValue: { fontSize: 12, fontWeight: '700' },
  slotsRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 10 },
  gemSocket: {
    width: 58, height: 58, borderRadius: 29, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', gap: 3,
  },
  gemDot: { width: 14, height: 14, borderRadius: 7 },
  gemSocketName: { fontSize: 9, fontWeight: '700', textAlign: 'center' },
  gemBonusBox: { borderRadius: 10, padding: 12, gap: 5, marginBottom: 4 },
  gemBonusTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 3 },
  gemBonusLine: { fontSize: 13 },
  matsList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  matChip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  matDot: { width: 8, height: 8, borderRadius: 4 },
  matName: { fontSize: 12, fontWeight: '500' },
  craftInfo: { fontSize: 12, marginBottom: 4 },
  enigmaStamp: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#5C00AA28', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#C084FC55',
    marginBottom: 10,
  },
  enigmaStampText: { fontSize: 12, fontWeight: '700', color: '#C084FC' },
  closeBtn: { marginTop: 22, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  closeBtnText: { fontSize: 15, fontWeight: '600' },
  meltBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, marginTop: 20, borderRadius: 12, borderWidth: 1 },
  meltTitle: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  meltDesc: { fontSize: 11, lineHeight: 16 },
  // Gem picker
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  pickerSheet: { maxHeight: '65%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, borderWidth: 1, borderBottomWidth: 0 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  pickerTitle: { fontSize: 18, fontWeight: '700' },
  pickerEmpty: { alignItems: 'center', paddingVertical: 36, gap: 12 },
  pickerEmptyText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  gemRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 8, gap: 12 },
  gemRowDot: { width: 22, height: 22, borderRadius: 11 },
  gemRowInfo: { flex: 1 },
  gemRowName: { fontSize: 15, fontWeight: '700', marginBottom: 2 },
  gemRowRarity: { fontSize: 11, fontWeight: '600', marginBottom: 5 },
  gemEffects: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  gemEffect: { fontSize: 11, fontWeight: '600' },
  qtyBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12 },
  qtyText: { fontSize: 13, fontWeight: '700' },
  // Remove confirm
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 24 },
  confirmBox: { borderRadius: 20, padding: 24, borderWidth: 1 },
  confirmTitle: { fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 },
  confirmDesc: { fontSize: 13, textAlign: 'center', marginBottom: 22 },
  confirmBtns: { flexDirection: 'row', gap: 12 },
  confirmBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  confirmBtnText: { fontSize: 14, fontWeight: '700' },
});
