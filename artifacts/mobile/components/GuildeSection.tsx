/**
 * GuildeSection — Guilde des Travailleurs idle worker UI.
 * Embedded in the World tab's main ScrollView.
 * Workers are unlimited — players can hire as many as they can afford.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useGame } from '@/context/GameContext';
import { useColors } from '@/hooks/useColors';
import { WORKER_DEFINITIONS, MAX_OFFLINE_MS } from '@/data/workers';
import type { WorkerType } from '@/types/game';

/** Base worker groups shown in this section */
const BASE_TYPES: Array<{ base: 'miner' | 'lumberjack'; standardType: WorkerType; eliteType: WorkerType }> = [
  { base: 'miner',      standardType: 'miner',      eliteType: 'elite_miner' },
  { base: 'lumberjack', standardType: 'lumberjack',  eliteType: 'elite_lumberjack' },
];

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Sac plein';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

function estimateUnits(
  workerLevel: number,
  workerType: WorkerType,
  lastClaimedAt: number,
  nowMs: number,
): { units: number; pct: number; msToFull: number } {
  const def = WORKER_DEFINITIONS[workerType];
  const lvlIdx = Math.min(workerLevel - 1, def.speedPerLevel.length - 1);
  const speedMult = def.speedPerLevel[lvlIdx];
  const carryCap = def.carryPerLevel[lvlIdx];

  const elapsedMs = Math.min(nowMs - lastClaimedAt, MAX_OFFLINE_MS);
  const elapsedHours = elapsedMs / 3_600_000;

  const eligibleRes = def.resources.filter((r) => r.minWorkerLevel <= workerLevel);
  const avgQtyPerRoll =
    eligibleRes.length > 0
      ? eligibleRes.reduce((s, r) => s + ((r.minQty + r.maxQty) / 2) * r.weight, 0) /
        eligibleRes.reduce((s, r) => s + r.weight, 0)
      : 1;

  const totalRolls = elapsedHours * def.baseRollsPerHour * speedMult;
  const estimated = Math.min(Math.floor(totalRolls * avgQtyPerRoll), carryCap);
  const pct = Math.min(100, Math.round((estimated / carryCap) * 100));

  const ratePerMs = (def.baseRollsPerHour * speedMult * avgQtyPerRoll) / 3_600_000;
  const remaining = Math.max(0, carryCap - estimated);
  const rawMsToFull = ratePerMs > 0 ? remaining / ratePerMs : MAX_OFFLINE_MS;
  const msToFull = Math.min(rawMsToFull, Math.max(0, lastClaimedAt + MAX_OFFLINE_MS - nowMs));

  return { units: estimated, pct, msToFull };
}

export default function GuildeSection() {
  const colors = useColors();
  const game = useGame();
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);
  const [now, setNow] = useState(Date.now);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Tick every 30 s for live progress
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const showFeedback = useCallback((id: string, msg: string) => {
    setFeedback((p) => ({ ...p, [id]: msg }));
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => setFeedback((p) => {
      const n = { ...p };
      delete n[id];
      return n;
    }), 2500);
  }, []);

  const handleHire = useCallback((type: WorkerType) => {
    const result = game.hireWorker(type);
    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showFeedback(`hire_${type}`, result.message);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showFeedback(`hire_${type}`, result.message);
    }
  }, [game, showFeedback]);

  const handleUpgrade = useCallback((workerId: string) => {
    const result = game.upgradeWorker(workerId);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    showFeedback(workerId, result.message);
  }, [game, showFeedback]);

  const handleCollect = useCallback((workerId: string) => {
    const result = game.collectWorker(workerId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const total = result.resources.reduce((s, r) => s + r.qty, 0) +
      (result.bonusResource?.qty ?? 0);
    if (total > 0) {
      showFeedback(workerId, `+${total} ressources${result.bonusResource ? ' 💎' : ''} !`);
    } else {
      showFeedback(workerId, "Rien à récolter pour l'instant");
    }
  }, [game, showFeedback]);

  const hiredWorkers = game.workers;
  const totalWorkers = hiredWorkers.length;

  return (
    <View style={[styles.wrapper, { paddingHorizontal: 16, marginTop: 14, marginBottom: 8 }]}>
      {/* Section header */}
      <TouchableOpacity
        style={[styles.header, { backgroundColor: colors.card, borderColor: '#C9A22755' }]}
        onPress={() => setExpanded((p) => !p)}
        activeOpacity={0.8}
      >
        <View style={styles.headerLeft}>
          <Text style={{ fontSize: 18 }}>⚒️</Text>
          <View>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>Guilde des Travailleurs</Text>
            <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
              {totalWorkers === 0
                ? 'Recrutez des ouvriers pour récolter en votre absence'
                : `${totalWorkers} ouvrier${totalWorkers > 1 ? 's' : ''} en service`}
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={colors.mutedForeground}
        />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.body}>
          {BASE_TYPES.map(({ base, standardType, eliteType }) => {
            const stdDef  = WORKER_DEFINITIONS[standardType];
            const groupWorkers = hiredWorkers.filter(
              (w) => w.type === standardType || w.type === eliteType,
            );
            const hireFb = feedback[`hire_${standardType}`];
            const canAfford = game.player.gold >= stdDef.hireCost;

            return (
              <View key={base} style={styles.group}>
                {/* Group label */}
                <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>
                  {stdDef.emoji}  {stdDef.name.toUpperCase()}S
                </Text>

                {/* Active worker cards */}
                {groupWorkers.map((worker) => {
                  const def = WORKER_DEFINITIONS[worker.type];
                  const isElite = def.isElite ?? false;
                  const lvlIdx = Math.min(worker.level - 1, def.speedPerLevel.length - 1);
                  const xpNeeded = def.xpThresholds[Math.min(worker.level - 1, def.xpThresholds.length - 1)];
                  const xpPct = worker.level >= 10 ? 100 : Math.min(100, Math.round((worker.xp / xpNeeded) * 100));
                  const carryCap = def.carryPerLevel[lvlIdx];
                  const { units, pct, msToFull } = estimateUnits(worker.level, worker.type, worker.lastClaimedAt, now);
                  const isAtCap = pct >= 100;
                  const upgradeCost = def.upgradeCosts[worker.level - 1];
                  const canUpgrade = worker.level < 10 && upgradeCost != null;
                  const workerFb = feedback[worker.id];

                  return (
                    <View
                      key={worker.id}
                      style={[
                        styles.card,
                        {
                          backgroundColor: colors.card,
                          borderColor: isAtCap ? '#C9A227' : isElite ? '#9966CC55' : colors.border,
                          borderWidth: isAtCap || isElite ? 1.5 : 1,
                        },
                      ]}
                    >
                      {/* Top row */}
                      <View style={styles.cardTop}>
                        <Text style={{ fontSize: 26 }}>{def.emoji}</Text>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <View style={styles.nameRow}>
                            <Text style={[styles.cardTitle, { color: colors.foreground }]}>{def.name}</Text>
                            <View style={[styles.levelBadge, { backgroundColor: '#C9A22722' }]}>
                              <Text style={[styles.levelBadgeText, { color: '#C9A227' }]}>Niv.{worker.level}</Text>
                            </View>
                            {isElite && (
                              <View style={[styles.levelBadge, { backgroundColor: '#9966CC33' }]}>
                                <Text style={[styles.levelBadgeText, { color: '#B58CDF' }]}>ÉLITE</Text>
                              </View>
                            )}
                            {isAtCap && (
                              <View style={[styles.levelBadge, { backgroundColor: '#C9A22740' }]}>
                                <Text style={[styles.levelBadgeText, { color: '#C9A227' }]}>SAC PLEIN</Text>
                              </View>
                            )}
                          </View>
                          {/* Worker XP bar */}
                          <View style={styles.xpRow}>
                            <View style={[styles.xpTrack, { backgroundColor: colors.muted }]}>
                              <View
                                style={[
                                  styles.xpFill,
                                  {
                                    width: `${xpPct}%` as `${number}%`,
                                    backgroundColor: isElite ? '#9966CC' : '#C9A227',
                                  },
                                ]}
                              />
                            </View>
                            <Text style={[styles.xpLabel, { color: colors.mutedForeground }]}>
                              {worker.level >= 10 ? 'MAX' : `${xpPct}%`}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Harvest progress */}
                      <View style={[styles.harvestRow, { backgroundColor: colors.secondary }]}>
                        <MaterialCommunityIcons
                          name={base === 'miner' ? 'pickaxe' : 'axe'}
                          size={13}
                          color={isAtCap ? '#C9A227' : colors.mutedForeground}
                        />
                        <View style={[styles.harvestTrack, { backgroundColor: colors.muted }]}>
                          <View
                            style={[
                              styles.harvestFill,
                              {
                                width: `${pct}%` as `${number}%`,
                                backgroundColor: isAtCap ? '#C9A227' : isElite ? '#9966CC' : colors.accent,
                              },
                            ]}
                          />
                        </View>
                        <Text style={[styles.harvestPct, { color: isAtCap ? '#C9A227' : colors.mutedForeground }]}>
                          {units}/{carryCap}
                        </Text>
                      </View>
                      <Text style={[styles.harvestEta, { color: colors.mutedForeground }]}>
                        {isAtCap
                          ? '⚠️ Récoltez maintenant pour ne pas perdre de ressources'
                          : `Sac plein dans ${formatCountdown(msToFull)}`}
                      </Text>

                      {workerFb && (
                        <Text
                          style={[
                            styles.feedback,
                            { color: workerFb.includes('!') ? colors.accent : colors.mutedForeground },
                          ]}
                        >
                          {workerFb}
                        </Text>
                      )}

                      {/* Action buttons */}
                      <View style={styles.actionRow}>
                        <TouchableOpacity
                          style={[
                            styles.actionBtn,
                            {
                              backgroundColor: isAtCap ? '#C9A227' : colors.primary,
                              flex: 2,
                            },
                          ]}
                          onPress={() => handleCollect(worker.id)}
                          activeOpacity={0.8}
                        >
                          <MaterialCommunityIcons
                            name="package-down"
                            size={14}
                            color={isAtCap ? '#000' : colors.primaryForeground}
                          />
                          <Text style={[styles.actionBtnText, { color: isAtCap ? '#000' : colors.primaryForeground }]}>
                            Récolter
                          </Text>
                        </TouchableOpacity>
                        {canUpgrade ? (
                          <TouchableOpacity
                            style={[
                              styles.actionBtn,
                              {
                                backgroundColor: colors.secondary,
                                borderColor: colors.border,
                                borderWidth: 1,
                                flex: 1,
                              },
                            ]}
                            onPress={() => handleUpgrade(worker.id)}
                            activeOpacity={0.8}
                          >
                            <MaterialCommunityIcons name="arrow-up-circle-outline" size={14} color={colors.foreground} />
                            <Text style={[styles.actionBtnText, { color: colors.foreground }]}>{upgradeCost}g</Text>
                          </TouchableOpacity>
                        ) : (
                          <View
                            style={[
                              styles.actionBtn,
                              {
                                backgroundColor: '#D4AF3722',
                                borderColor: '#D4AF3755',
                                borderWidth: 1,
                                flex: 1,
                                opacity: 0.7,
                              },
                            ]}
                          >
                            <MaterialCommunityIcons name="crown" size={14} color="#D4AF37" />
                            <Text style={[styles.actionBtnText, { color: '#D4AF37' }]}>MAX</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  );
                })}

                {/* Hire standard worker — always visible */}
                <View style={styles.hireRow}>
                  {hireFb && (
                    <Text style={[styles.feedback, { color: canAfford ? colors.accent : colors.destructive }]}>
                      {hireFb}
                    </Text>
                  )}
                  <TouchableOpacity
                    style={[
                      styles.hireBtn,
                      {
                        backgroundColor: canAfford ? colors.primary : colors.muted,
                        opacity: canAfford ? 1 : 0.65,
                      },
                    ]}
                    onPress={() => handleHire(standardType)}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons
                      name="plus-circle-outline"
                      size={14}
                      color={canAfford ? colors.primaryForeground : colors.mutedForeground}
                    />
                    <Text
                      style={[
                        styles.hireBtnText,
                        { color: canAfford ? colors.primaryForeground : colors.mutedForeground },
                      ]}
                    >
                      Recruter {stdDef.name} · {stdDef.hireCost}g
                    </Text>
                  </TouchableOpacity>

                  {/* Elite teaser */}
                  <TouchableOpacity
                    style={[styles.eliteTeaser, { borderColor: '#9966CC44' }]}
                    onPress={() => router.push('/boutique')}
                    activeOpacity={0.8}
                  >
                    <Text style={{ fontSize: 12 }}>
                      {WORKER_DEFINITIONS[eliteType].emoji}
                    </Text>
                    <Text style={[styles.eliteTeaserText, { color: '#B58CDF' }]}>
                      {WORKER_DEFINITIONS[eliteType].name} disponible en Boutique →
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {},
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 2,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  headerTitle: { fontSize: 14, fontWeight: '800' },
  headerSub: { fontSize: 11, marginTop: 1 },
  body: { marginTop: 8, gap: 16 },
  group: { gap: 8 },
  groupLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginBottom: 2 },
  card: { borderRadius: 12, borderWidth: 1, padding: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardTitle: { fontSize: 14, fontWeight: '700' },
  levelBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  levelBadgeText: { fontSize: 10, fontWeight: '800' },
  xpRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  xpTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  xpFill: { height: '100%', borderRadius: 2 },
  xpLabel: { fontSize: 10, minWidth: 26, textAlign: 'right' },
  harvestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginBottom: 4,
  },
  harvestTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  harvestFill: { height: '100%', borderRadius: 3 },
  harvestPct: { fontSize: 11, fontWeight: '600', minWidth: 36, textAlign: 'right' },
  harvestEta: { fontSize: 10, marginBottom: 8 },
  feedback: { fontSize: 12, fontWeight: '600', textAlign: 'center', marginBottom: 4 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderRadius: 8,
    paddingVertical: 9,
  },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
  hireRow: { gap: 6 },
  hireBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    paddingVertical: 10,
  },
  hireBtnText: { fontSize: 12, fontWeight: '700' },
  eliteTeaser: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 8,
    paddingVertical: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  eliteTeaserText: { fontSize: 11, fontWeight: '600' },
});
