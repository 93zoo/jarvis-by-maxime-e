/**
 * LeaderboardContext — tracks the number of unclaimed leaderboard rewards.
 *
 * Fetches on mount (once the game is loaded and a playerId is available) and
 * re-fetches every time the app comes back to the foreground, so the badge in
 * the tab bar stays in sync even after the player backgrounds the app.
 *
 * Exposes:
 *  • pendingCount  — number of unclaimed awards (drives the tab badge)
 *  • refreshPending — call this after the player claims an award to update
 *                     the count immediately without waiting for foreground.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useGame } from '@/context/GameContext';
import { fetchLeaderboardRewards, isLeaderboardAvailable } from '@/lib/leaderboard';

interface LeaderboardPendingContextValue {
  /** Number of unclaimed leaderboard rewards for the current player. */
  pendingCount: number;
  /** Re-fetches pending rewards from the server immediately. */
  refreshPending: () => void;
}

const LeaderboardPendingContext = createContext<LeaderboardPendingContextValue>({
  pendingCount: 0,
  refreshPending: () => {},
});

export function useLeaderboardPending(): LeaderboardPendingContextValue {
  return useContext(LeaderboardPendingContext);
}

export function LeaderboardProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded } = useGame();
  const [pendingCount, setPendingCount] = useState(0);
  // Track the last known playerId so we can fetch as soon as it's available.
  const playerIdRef = useRef<string | null>(null);

  const doFetch = useCallback(async () => {
    if (!isLeaderboardAvailable()) return;
    try {
      let pid = playerIdRef.current;
      if (!pid) {
        pid = await AsyncStorage.getItem('@fk_player_id');
        playerIdRef.current = pid;
      }
      if (!pid) return;
      const { pending } = await fetchLeaderboardRewards(pid);
      setPendingCount(pending.length);
    } catch {
      // best-effort — badge just stays at last known value
    }
  }, []);

  // Fetch on game load
  useEffect(() => {
    if (!isLoaded) return;
    doFetch();
  }, [isLoaded, doFetch]);

  // Re-fetch every time the app comes to the foreground (native only;
  // web uses visibilitychange so skip to avoid duplicate listeners).
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        doFetch();
      }
    });
    return () => sub.remove();
  }, [doFetch]);

  return (
    <LeaderboardPendingContext.Provider value={{ pendingCount, refreshPending: doFetch }}>
      {children}
    </LeaderboardPendingContext.Provider>
  );
}
