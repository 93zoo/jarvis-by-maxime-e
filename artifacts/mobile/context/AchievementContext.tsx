/**
 * AchievementContext
 *
 * Sits inside <GameProvider>. Reads game state via useGame(), checks all 33+
 * achievement conditions whenever relevant state fields change, shows a toast
 * via <AchievementToast />, and persists unlocked ids to AsyncStorage.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Achievement } from '@/types/game';
import { useGame } from '@/context/GameContext';
import AchievementToast from '@/components/AchievementToast';
import AudioManager from '@/utils/AudioManager';

// ─── Static achievement data ──────────────────────────────────────────────────
const ALL_ACHIEVEMENTS: Achievement[] = require('@/data/achievements.json');

const ACHI_SAVE_KEY = '@fk_achievements_v1';

// ─── Context shape ────────────────────────────────────────────────────────────
interface AchievementContextType {
  unlockedIds: Set<string>;
  allAchievements: Achievement[];
  totalUnlocked: number;
}

const AchievementCtx = createContext<AchievementContextType>({
  unlockedIds: new Set(),
  allAchievements: ALL_ACHIEVEMENTS,
  totalUnlocked: 0,
});

export function useAchievements() {
  return useContext(AchievementCtx);
}

// ─── Provider ─────────────────────────────────────────────────────────────────
export function AchievementProvider({ children }: { children: React.ReactNode }) {
  const game = useGame();
  const [unlockedIds, setUnlockedIds] = useState<Set<string>>(new Set());
  const [toastQueue, setToastQueue] = useState<Achievement[]>([]);
  const [activeToast, setActiveToast] = useState<Achievement | null>(null);
  const loadedRef = useRef(false);

  // ── Load persisted achievements on mount ──────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(ACHI_SAVE_KEY);
        if (raw) {
          const ids: string[] = JSON.parse(raw);
          setUnlockedIds(new Set(ids));
        }
      } catch {
        // ignore
      }
      loadedRef.current = true;
    })();
  }, []);

  // ── Persist to AsyncStorage whenever unlocked set changes ─────────────────
  useEffect(() => {
    if (!loadedRef.current) return;
    AsyncStorage.setItem(ACHI_SAVE_KEY, JSON.stringify([...unlockedIds])).catch(() => {});
  }, [unlockedIds]);

  // ── Toast queue management ─────────────────────────────────────────────────
  useEffect(() => {
    if (activeToast === null && toastQueue.length > 0) {
      setActiveToast(toastQueue[0]);
      setToastQueue((q) => q.slice(1));
    }
  }, [activeToast, toastQueue]);

  const dismissToast = useCallback(() => {
    setActiveToast(null);
  }, []);

  // ── Check a single achievement condition against current game state ────────
  const meetsCondition = useCallback(
    (ach: Achievement, currentUnlockedCount: number): boolean => {
      const { condition } = ach;
      const p = game.player;
      const { type, value } = condition;

      switch (type) {
        case 'totalItemsCrafted':
          return p.totalItemsCrafted >= value;
        case 'totalGoldEarned':
          return p.totalGoldEarned >= value;
        case 'goldCurrent':
          return p.gold >= value;
        case 'questsCompleted':
          return game.completedQuestIds.length >= value;
        case 'questsAccepted':
          return (p.totalQuestsAccepted ?? 0) >= value;
        case 'regionsUnlocked':
          return game.unlockedRegions.length >= value;
        case 'talentsUnlocked':
          return p.talentsUnlocked.length >= value;
        case 'ordersDelivered':
          return (p.totalOrdersDelivered ?? 0) >= value;
        case 'craftQuality': {
          if (condition.quality === 'legendary') return (p.craftedLegendaryCount ?? 0) >= value;
          if (condition.quality === 'excellent') return (p.craftedExcellentCount ?? 0) >= value;
          return false;
        }
        case 'forgeUpgradeLevels': {
          const total = Object.values(game.forgeUpgrades).reduce((a, b) => a + b, 0);
          return total >= value;
        }
        case 'talentPoints':
          return p.talentPoints >= value;
        case 'playerLevel':
          return p.level >= value;
        case 'skillLevel':
          if (!condition.skill) return false;
          return (p.skills[condition.skill] ?? 0) >= value;
        case 'inventoryItems': {
          const total = game.inventory.reduce((a, i) => a + i.quantity, 0);
          return total >= value;
        }
        case 'achievementsUnlocked':
          return currentUnlockedCount >= value;
        default:
          return false;
      }
    },
    [game],
  );

  // ── Run achievement checks when game state changes ─────────────────────────
  useEffect(() => {
    if (!game.isLoaded || !loadedRef.current) return;

    const newlyUnlocked: Achievement[] = [];

    // We need to know how many are currently unlocked to evaluate 'achievementsUnlocked'
    let currentCount = unlockedIds.size;

    for (const ach of ALL_ACHIEVEMENTS) {
      if (unlockedIds.has(ach.id)) continue;
      if (meetsCondition(ach, currentCount)) {
        newlyUnlocked.push(ach);
        currentCount++;
      }
    }

    if (newlyUnlocked.length === 0) return;

    // Update state
    setUnlockedIds((prev) => {
      const next = new Set(prev);
      for (const a of newlyUnlocked) next.add(a.id);
      return next;
    });

    // Queue toasts (with small delay between them)
    setToastQueue((q) => [...q, ...newlyUnlocked]);

    // Rewards: apply XP/gold for each achievement
    for (const ach of newlyUnlocked) {
      if (ach.reward?.xp) game.addPlayerXP(ach.reward.xp);
      if (ach.reward?.gold) game.addGold(ach.reward.gold);
    }
  // We intentionally watch individual fields that achievements care about, not the whole game object
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    game.isLoaded,
    game.player.totalItemsCrafted,
    game.player.totalGoldEarned,
    game.player.gold,
    game.player.level,
    game.player.talentsUnlocked.length,
    game.player.totalOrdersDelivered,
    game.player.craftedLegendaryCount,
    game.player.craftedExcellentCount,
    game.player.totalQuestsAccepted,
    game.completedQuestIds.length,
    game.unlockedRegions.length,
    // Watch total inventory quantity (not just array length) so quantity-only changes trigger checks
    game.inventory.reduce((a, i) => a + i.quantity, 0),
    // forgeUpgrades is an object; we watch its total
    Object.values(game.forgeUpgrades).reduce((a, b) => a + b, 0),
  ]);

  // ── Init audio on first user interaction ──────────────────────────────────
  useEffect(() => {
    AudioManager.init();
  }, []);

  const value: AchievementContextType = {
    unlockedIds,
    allAchievements: ALL_ACHIEVEMENTS,
    totalUnlocked: unlockedIds.size,
  };

  return (
    <AchievementCtx.Provider value={value}>
      {children}
      <AchievementToast achievement={activeToast} onDismiss={dismissToast} />
    </AchievementCtx.Provider>
  );
}
