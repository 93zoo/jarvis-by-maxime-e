---
name: Layout provider mount guard
description: The return null guard in _layout.tsx protects against save-corruption race conditions — never remove it.
---

# Layout Provider Mount Guard

**Rule:** Never remove the `if (!fontsLoaded && !fontError) return null` guard in `artifacts/mobile/app/_layout.tsx`.

**Why:** Removing it causes `GameProvider` (and `SubscriptionProvider`, `KeyboardProvider`, etc.) to mount before the provider tree is stable. This produces a double-mount of `GameProvider`: the first mount dispatches `RESET` (because AsyncStorage timing is off), the auto-save effect fires on `isLoaded: true`, and writes the empty state over the real save. The user loses all progression. This happened in production on 2026-08-01.

**How to apply:** Any startup performance optimization must work *within* the existing mount order. The only safe change is deferring side-effects (e.g. `initializeRevenueCat()` to `useEffect`) — not changing when providers mount. Lazy-loading JSON data files is the correct path for startup speed (see task #182).
