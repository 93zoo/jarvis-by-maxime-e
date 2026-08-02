---
name: Dispatch from Reanimated runOnJS — quest tracking gap
description: Calling game context functions from doCollect (runOnJS) can silently fail for quest progress. Use a combined GameContext function instead.
---

## Rule
Never call two separate `game.xxx()` context functions from inside `doCollect` (called via Reanimated `runOnJS`) and expect both to reliably update state. The closure capture in Reanimated worklets means a stale `game` reference may drop one of the dispatches silently.

**Why:** `doCollect` in `ExploreView` is a `useCallback` called via `runOnJS`. The `game` object captured in the worklet closure can be stale when the animation completes. Two sequential dispatches (`addResource` then `updateQuestProgress`) may use different snapshots of state, or `updateQuestProgress` may be called on a stale context ref.

**How to apply:** Combine related dispatches into a single GameContext `useCallback` (like `harvestResource`) that fires both `ADD_RESOURCE` and `UPDATE_QUEST_PROGRESS` atomically from within the context — matching the pattern used by `craftItem` for craft quests. Then `doCollect` calls only `game.harvestResource(resourceId, qty)`.

The same applies to any future per-node action that needs side effects (XP grants, quest tracking, etc.) — wrap them in a single GameContext function rather than chaining multiple `game.xxx()` calls from a Reanimated callback.
