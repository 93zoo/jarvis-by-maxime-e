/**
 * WorkerReturnModal — shown on app open when idle workers have accumulated resources.
 * Receives pre-computed harvest results; the parent calls collectWorker() on confirm.
 */
import React from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { WorkerHarvestResult } from '@/data/workers';
import { WORKER_DEFINITIONS } from '@/data/workers';
import type { Worker } from '@/types/game';

export interface WorkerReturnEntry {
  worker: Worker;
  result: WorkerHarvestResult;
}

interface Props {
  visible: boolean;
  entries: WorkerReturnEntry[];
  getResourceName: (id: string) => string;
  getResourceColor: (id: string) => string;
  onCollect: () => void;
}

function formatDuration(ms: number): string {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export default function WorkerReturnModal({ visible, entries, getResourceName, getResourceColor, onCollect }: Props) {
  const colors = useColors();

  if (entries.length === 0) return null;

  const totalResources = entries.flatMap((e) => [
    ...e.result.resources,
    ...(e.result.bonusResource ? [e.result.bonusResource] : []),
  ]);
  const maxElapsed = Math.max(...entries.map((e) => e.result.elapsedMs));
  const totalPlayerXp = entries.reduce((s, e) => s + e.result.playerXpEarned, 0);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCollect}>
      <Pressable style={styles.backdrop} onPress={onCollect}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={(e) => e.stopPropagation()}>
          {/* Title */}
          <View style={styles.titleRow}>
            <Feather name="home" size={32} color="#C9A227" />
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>Vos ouvriers sont revenus !</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                Absent depuis {formatDuration(maxElapsed)}
              </Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 400 }}>
            {entries.map(({ worker, result }) => {
              const def = WORKER_DEFINITIONS[worker.type];
              return (
                <View key={worker.id} style={[styles.workerCard, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                  {/* Worker header */}
                  <View style={styles.workerHeader}>
                    <Text style={{ fontSize: 22 }}>{def.emoji}</Text>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={[styles.workerName, { color: colors.foreground }]}>
                        {def.name} <Text style={{ color: colors.mutedForeground }}>Niv.{result.newLevel}</Text>
                      </Text>
                      {result.leveledUp && (
                        <View style={styles.levelUpBadge}>
                          <Feather name="arrow-up-circle" size={12} color="#FFD700" />
                          <Text style={styles.levelUpText}>NIVEAU SUPÉRIEUR !</Text>
                        </View>
                      )}
                      <Text style={[styles.workerXp, { color: colors.mutedForeground }]}>
                        +{result.workerXpEarned} XP ouvrier
                      </Text>
                    </View>
                  </View>

                  {/* Resources collected */}
                  {result.resources.length > 0 ? (
                    <View style={styles.resourceGrid}>
                      {result.resources.map((r) => (
                        <View key={r.resourceId} style={[styles.resourceChip, { backgroundColor: colors.card }]}>
                          <View style={[styles.resDot, { backgroundColor: getResourceColor(r.resourceId) }]} />
                          <Text style={[styles.resName, { color: colors.foreground }]}>{getResourceName(r.resourceId)}</Text>
                          <Text style={[styles.resQty, { color: colors.accent }]}>×{r.qty}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={[styles.nothingText, { color: colors.mutedForeground }]}>Rien récolté (temps trop court)</Text>
                  )}

                  {/* Bonus find */}
                  {result.bonusResource && (
                    <View style={[styles.bonusRow, { backgroundColor: '#D4AF3722', borderColor: '#D4AF3755' }]}>
                      <Feather name="hexagon" size={14} color="#D4AF37" />
                      <Text style={[styles.bonusText, { color: '#D4AF37' }]}>
                        Trouvaille rare : {getResourceName(result.bonusResource.resourceId)} ×{result.bonusResource.qty}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}

            {/* Summary */}
            <View style={[styles.summaryRow, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Feather name="star" size={15} color={colors.accent} />
              <Text style={[styles.summaryText, { color: colors.foreground }]}>
                +{totalPlayerXp} XP forgeron
              </Text>
              <Text style={[styles.summaryText, { color: colors.mutedForeground }]}>
                · {totalResources.length} types de ressources
              </Text>
            </View>
          </ScrollView>

          <TouchableOpacity
            style={[styles.collectBtn, { backgroundColor: '#C9A227' }]}
            onPress={onCollect}
            activeOpacity={0.85}
          >
            <Feather name="download" size={18} color="#000" />
            <Text style={styles.collectBtnText}>Récupérer tout</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
  titleEmoji: { fontSize: 28 },
  title: { fontSize: 17, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  workerCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 10 },
  workerHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  workerName: { fontSize: 14, fontWeight: '700' },
  levelUpBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  levelUpText: { fontSize: 10, fontWeight: '800', color: '#FFD700' },
  workerXp: { fontSize: 11, marginTop: 1 },
  resourceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  resourceChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  resDot: { width: 8, height: 8, borderRadius: 4 },
  resName: { fontSize: 12, fontWeight: '600' },
  resQty: { fontSize: 12, fontWeight: '700' },
  nothingText: { fontSize: 12, fontStyle: 'italic' },
  bonusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 8, borderWidth: 1, padding: 8, marginTop: 4 },
  bonusText: { fontSize: 12, fontWeight: '700' },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, padding: 10, marginTop: 4, marginBottom: 14 },
  summaryText: { fontSize: 13, fontWeight: '600' },
  collectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 14 },
  collectBtnText: { fontSize: 15, fontWeight: '800', color: '#000' },
});
