import React, { useState } from 'react';
import {
  ActivityIndicator,
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
import type { RegionData } from '@/types/game';

const REGION_ICONS: Record<string, string> = {
  village: 'home',
  forest: 'wind',
  mountains: 'triangle',
  mines: 'tool',
  swamp: 'droplet',
  desert: 'sun',
  ruins: 'layers',
  port: 'anchor',
  volcano: 'zap',
  castle: 'shield',
};

const REGION_COLORS: Record<string, string> = {
  village: '#4CAF50',
  forest: '#2E7D32',
  mountains: '#546E7A',
  mines: '#78909C',
  swamp: '#558B2F',
  desert: '#F9A825',
  ruins: '#6D4C41',
  port: '#0277BD',
  volcano: '#BF360C',
  castle: '#6A1E9A',
};

export default function WorldScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const game = useGame();
  const [selectedRegion, setSelectedRegion] = useState<RegionData | null>(null);
  const [collectResult, setCollectResult] = useState<{ resourceId: string; quantity: number }[]>([]);
  const [showCollectResult, setShowCollectResult] = useState(false);
  const headerTopPad = Platform.OS === 'web' ? 67 : insets.top;

  if (!game.isLoaded) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const handleCollect = () => {
    if (!selectedRegion) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const drops = game.collectFromRegion(selectedRegion.id);
    setSelectedRegion(null);
    setCollectResult(drops);
    setShowCollectResult(true);
  };

  const handleUnlock = (region: RegionData) => {
    if (game.player.level >= region.levelRequired) {
      game.unlockRegion(region.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <LinearGradient
        colors={[colors.card as string, colors.background as string]}
        style={[styles.header, { paddingTop: headerTopPad + 12 }]}
      >
        <View style={styles.headerLeft}>
          <Feather name="map" size={22} color={colors.primary} />
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>MONDE</Text>
        </View>
        <View style={[styles.headerBadge, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.headerBadgeText, { color: colors.accent }]}>
            {game.unlockedRegions.length}/10 régions
          </Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Explorez le monde et collectez des ressources rares
        </Text>

        {game.allRegions.map((region) => {
          const isUnlocked = game.unlockedRegions.includes(region.id);
          const canUnlock = game.player.level >= region.levelRequired;
          const exploration = game.regionExploration[region.id] ?? 0;
          const regionColor = REGION_COLORS[region.id] ?? colors.primary;
          const iconName = (REGION_ICONS[region.id] ?? 'map-pin') as 'map';

          return (
            <TouchableOpacity
              key={region.id}
              style={[
                styles.regionCard,
                {
                  backgroundColor: colors.card,
                  borderColor: isUnlocked ? regionColor : colors.border,
                  opacity: isUnlocked ? 1 : 0.6,
                },
              ]}
              onPress={() => {
                if (isUnlocked) {
                  setSelectedRegion(region);
                } else if (canUnlock) {
                  handleUnlock(region);
                }
              }}
              activeOpacity={0.8}
            >
              <View style={styles.regionLeft}>
                <View style={[styles.regionIcon, { backgroundColor: `${regionColor}22` }]}>
                  <Feather name={iconName} size={24} color={regionColor} />
                </View>
                <View style={styles.regionInfo}>
                  <View style={styles.regionNameRow}>
                    <Text style={[styles.regionName, { color: isUnlocked ? colors.foreground : colors.mutedForeground }]}>
                      {region.name}
                    </Text>
                    {isUnlocked && (
                      <View style={[styles.unlockedBadge, { backgroundColor: `${regionColor}33` }]}>
                        <Text style={[styles.unlockedText, { color: regionColor }]}>
                          DÉBLOQUÉ
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.regionBiome, { color: colors.mutedForeground }]}>
                    {region.biome.charAt(0).toUpperCase() + region.biome.slice(1)}
                  </Text>
                  {isUnlocked ? (
                    <View style={styles.explorationRow}>
                      <View style={[styles.explorationTrack, { backgroundColor: colors.muted }]}>
                        <View
                          style={[
                            styles.explorationFill,
                            { width: `${exploration}%` as `${number}%`, backgroundColor: regionColor },
                          ]}
                        />
                      </View>
                      <Text style={[styles.explorationPct, { color: colors.mutedForeground }]}>
                        {exploration}%
                      </Text>
                    </View>
                  ) : (
                    <Text style={[styles.levelReq, { color: canUnlock ? colors.accent : colors.destructive }]}>
                      {canUnlock ? `Appuyez pour débloquer` : `Niveau ${region.levelRequired} requis`}
                    </Text>
                  )}
                </View>
              </View>
              <View style={styles.regionRight}>
                <Feather
                  name={isUnlocked ? 'chevron-right' : 'lock'}
                  size={18}
                  color={isUnlocked ? colors.mutedForeground : colors.destructive}
                />
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Region Detail Modal */}
      <Modal visible={!!selectedRegion} transparent animationType="slide" statusBarTranslucent>
        {selectedRegion && (
          <View style={styles.overlay}>
            <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={[styles.handle, { backgroundColor: colors.muted }]} />

              <View style={styles.sheetHeader}>
                <View
                  style={[
                    styles.sheetIconBg,
                    { backgroundColor: `${REGION_COLORS[selectedRegion.id] ?? colors.primary}22` },
                  ]}
                >
                  <Feather
                    name={(REGION_ICONS[selectedRegion.id] ?? 'map-pin') as 'map'}
                    size={28}
                    color={REGION_COLORS[selectedRegion.id] ?? colors.primary}
                  />
                </View>
                <View>
                  <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                    {selectedRegion.name}
                  </Text>
                  <Text style={[styles.sheetBiome, { color: colors.mutedForeground }]}>
                    {selectedRegion.biome} · Exploration{' '}
                    {game.regionExploration[selectedRegion.id] ?? 0}%
                  </Text>
                </View>
              </View>

              <Text style={[styles.sheetDesc, { color: colors.mutedForeground }]}>
                {selectedRegion.description}
              </Text>

              <Text style={[styles.sheetLabel, { color: colors.primary }]}>
                RESSOURCES DISPONIBLES
              </Text>
              <View style={styles.resourceGrid}>
                {selectedRegion.resourceNodes.map((node) => {
                  const res = game.getResourceById(node.resourceId);
                  return (
                    <View
                      key={node.resourceId}
                      style={[styles.resourceChip, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                    >
                      <View style={[styles.resDot, { backgroundColor: res?.color ?? colors.primary }]} />
                      <Text style={[styles.resName, { color: colors.foreground }]}>
                        {res?.name ?? node.resourceId}
                      </Text>
                      <Text style={[styles.resRate, { color: colors.mutedForeground }]}>
                        {Math.round(node.dropRate * 100)}%
                      </Text>
                    </View>
                  );
                })}
              </View>

              <Text style={[styles.sheetLabel, { color: colors.primary }]}>BOSS</Text>
              <View style={[styles.bossCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Feather name="alert-triangle" size={16} color={colors.destructive} />
                <Text style={[styles.bossName, { color: colors.foreground }]}>
                  {selectedRegion.boss.name}
                </Text>
                <Text style={[styles.bossLevel, { color: colors.destructive }]}>
                  Niv.{selectedRegion.boss.level}
                </Text>
              </View>

              <View style={styles.sheetBtns}>
                <TouchableOpacity
                  style={[styles.btnCancel, { borderColor: colors.border }]}
                  onPress={() => setSelectedRegion(null)}
                >
                  <Text style={[styles.btnCancelText, { color: colors.mutedForeground }]}>
                    Fermer
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnCollect, { backgroundColor: REGION_COLORS[selectedRegion.id] ?? colors.primary }]}
                  onPress={handleCollect}
                >
                  <Feather name="crosshair" size={15} color="#fff" />
                  <Text style={styles.btnCollectText}>Collecter</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Modal>

      {/* Collect Result Modal */}
      <Modal visible={showCollectResult} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.overlay}>
          <View style={[styles.resultBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="package" size={32} color={colors.accent} />
            <Text style={[styles.resultTitle, { color: colors.foreground }]}>
              Ressources collectées !
            </Text>
            {collectResult.length === 0 ? (
              <Text style={[styles.resultEmpty, { color: colors.mutedForeground }]}>
                Rien trouvé cette fois… réessayez !
              </Text>
            ) : (
              collectResult.map((drop) => {
                const res = game.getResourceById(drop.resourceId);
                return (
                  <View key={drop.resourceId} style={styles.dropRow}>
                    <View style={[styles.dropDot, { backgroundColor: res?.color ?? colors.primary }]} />
                    <Text style={[styles.dropName, { color: colors.foreground }]}>
                      +{drop.quantity} {res?.name ?? drop.resourceId}
                    </Text>
                  </View>
                );
              })
            )}
            <TouchableOpacity
              style={[styles.resultBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setShowCollectResult(false);
                setCollectResult([]);
              }}
            >
              <Text style={[styles.resultBtnText, { color: colors.primaryForeground }]}>
                Super !
              </Text>
            </TouchableOpacity>
          </View>
        </View>
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
  headerBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  headerBadgeText: { fontSize: 12, fontWeight: '600' },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 16, paddingTop: 8 },
  subtitle: { fontSize: 13, lineHeight: 18, marginBottom: 16 },
  regionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  regionLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  regionIcon: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  regionInfo: { flex: 1 },
  regionNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  regionName: { fontSize: 15, fontWeight: '600' },
  unlockedBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  unlockedText: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  regionBiome: { fontSize: 11, marginTop: 2, marginBottom: 6 },
  explorationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  explorationTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  explorationFill: { height: '100%', borderRadius: 2, minWidth: 2 },
  explorationPct: { fontSize: 10, minWidth: 28 },
  levelReq: { fontSize: 11, marginTop: 2 },
  regionRight: { paddingLeft: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, borderWidth: 1, borderBottomWidth: 0 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 14 },
  sheetIconBg: { width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  sheetTitle: { fontSize: 22, fontWeight: '700' },
  sheetBiome: { fontSize: 12, marginTop: 2 },
  sheetDesc: { fontSize: 13, lineHeight: 20, marginBottom: 20 },
  sheetLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, marginBottom: 10 },
  resourceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  resourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  resDot: { width: 8, height: 8, borderRadius: 4 },
  resName: { fontSize: 12 },
  resRate: { fontSize: 11 },
  bossCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    marginBottom: 20,
  },
  bossName: { flex: 1, fontSize: 14, fontWeight: '600' },
  bossLevel: { fontSize: 13, fontWeight: '700' },
  sheetBtns: { flexDirection: 'row', gap: 12 },
  btnCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
  btnCancelText: { fontSize: 14, fontWeight: '600' },
  btnCollect: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  btnCollectText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  resultBox: {
    margin: 40,
    borderRadius: 20,
    padding: 28,
    borderWidth: 1,
    alignItems: 'center',
    gap: 12,
  },
  resultTitle: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  resultEmpty: { fontSize: 14, textAlign: 'center' },
  dropRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dropDot: { width: 10, height: 10, borderRadius: 5 },
  dropName: { fontSize: 15 },
  resultBtn: { marginTop: 8, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  resultBtnText: { fontSize: 15, fontWeight: '700' },
});
