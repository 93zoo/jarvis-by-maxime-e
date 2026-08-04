---
name: iOS overflow clipping on zero-width views
description: RN View with width:0 clips all children on iOS; Android renders overflow freely.
---

# iOS overflow clipping on zero-width RN Views

**Rule:** On iOS, React Native's default `overflow` for `View` is `'hidden'`. A `View` with `width: 0` (or `height: 0`) will clip all absolutely-positioned children that extend beyond those zero bounds — even if those children would be visually inside a larger ancestor.

**Why:** Android renders overflow freely by default; this discrepancy means a component can look correct in dev (Android emulator) but be completely invisible on iOS.

**How to apply:** Any `View` used purely as a positioned anchor (zero-width/height) must explicitly set `overflow: 'visible'` if its children are meant to extend outside its own bounds. Give it a small but non-zero dimension (e.g. `width: 2`) so the bounds are well-defined, and add `overflow: 'visible'`.

Example: `HammeringMiniGame.tsx` — `needleWrapper` had `width: 0`, causing the needle line and diamonds to be invisible on iOS.
