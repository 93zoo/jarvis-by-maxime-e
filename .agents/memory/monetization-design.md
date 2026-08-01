---
name: Monetization design rules
description: Durable rules for RevenueCat shop and rewarded ads in the mobile game
---

- Gold consumables are granted ONLY by the idempotent reconciler (dedupe by RevenueCat transactionIdentifier persisted in AsyncStorage), never directly in the purchase handler. **Why:** avoids double-grant/loss if app dies mid-purchase.
- Premium entitlement (`premium`) reaches GameContext via a module-level bridge (premiumStatus), since GameProvider sits below SubscriptionProvider.
- Rewarded ads: unlocked at blacksmith level 5, always optional, simulated 5s ad in Expo Go/web (real SDK to be plugged in native store builds only). One ad at a time (reentrancy guard).
- Daily rewards: use the TWO-PHASE pattern — persist day marker with `credited:false`, credit, then set `credited:true`; on next launch, recover any uncredited marker exactly once. Never single-write in either order (double-grant or loss). Client-side day gating is an accepted limitation (offline solo game).
- Studio identity: « Braise Noire Studios », tagline « Des jeux forgés à la main » — or #E8B84B sur charbon #0D0A07 (constants/studio.ts). Splash must block touches (pointerEvents auto).
- Never hardcode prices — always read from RevenueCat offerings (`priceString`).
- App Store compliance: shop shows restore button + auto-renewal disclosure text; privacy policy still needed before store submission.
