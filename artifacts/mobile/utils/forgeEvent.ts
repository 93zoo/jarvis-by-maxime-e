/**
 * Forge event utilities — shared between ForgeEventBanner (UI) and GameContext (game logic).
 * Extracted here to avoid circular imports (ForgeEventBanner imports GameContext, so
 * GameContext must not import ForgeEventBanner).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Keys (must match ForgeEventBanner.tsx) ────────────────────────────────────

export const FE_KEY_EVENT_ID    = '@fk_event_id';
export const FE_KEY_ACTIVATED   = '@fk_event_activated_at';
export const FE_COOLDOWN_MS     = 60 * 60_000; // 1 hour

// ── Implemented event IDs ─────────────────────────────────────────────────────
// Only events that are actually wired into game systems.

export type ForgeEventId =
  | 'free_chest'      // immediate: grants iron/coal/crystal
  | 'mystery_reward'  // immediate: random rare resource
  | 'gem_chance'      // timed: +20 quality score in craftGem
  | 'gold_bonus'      // timed: +30% sell price on items
  | 'double_xp';      // timed: ×2 XP on boss fight wins

// ── Active event query ────────────────────────────────────────────────────────

/**
 * Returns the active event ID if one was activated within the last hour, or null.
 * Async because it reads AsyncStorage. Call from useEffect / async contexts only.
 */
export async function getActiveForgeEventId(): Promise<ForgeEventId | null> {
  try {
    const [eventId, actAt] = await Promise.all([
      AsyncStorage.getItem(FE_KEY_EVENT_ID),
      AsyncStorage.getItem(FE_KEY_ACTIVATED),
    ]);
    if (!eventId || !actAt) return null;
    const activatedAt = parseInt(actAt, 10);
    if (Date.now() - activatedAt >= FE_COOLDOWN_MS) return null;
    // Validate it's an implemented event
    const implemented: ForgeEventId[] = ['free_chest', 'mystery_reward', 'gem_chance', 'gold_bonus', 'double_xp'];
    if (!implemented.includes(eventId as ForgeEventId)) return null;
    return eventId as ForgeEventId;
  } catch {
    return null;
  }
}
