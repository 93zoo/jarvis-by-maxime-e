---
name: Monetization design rules
description: Durable rules for RevenueCat shop and rewarded ads in the mobile game
---

- Gold consumables are granted ONLY by the idempotent reconciler (dedupe by RevenueCat transactionIdentifier persisted in AsyncStorage), never directly in the purchase handler. **Why:** avoids double-grant/loss if app dies mid-purchase.
- Premium entitlement (`premium`) reaches GameContext via a module-level bridge (premiumStatus), since GameProvider sits below SubscriptionProvider.
- Rewarded ads: unlocked at blacksmith level 5, always optional, simulated 5s ad in Expo Go/web (real SDK to be plugged in native store builds only). One ad at a time (reentrancy guard).
- Daily rewards: credit rewards BEFORE persisting the day marker (crash → at worst a bonus, never a loss). Client-side day gating is an accepted limitation (offline solo game).
- Never hardcode prices — always read from RevenueCat offerings (`priceString`).
- App Store compliance: shop shows restore button + auto-renewal disclosure text; privacy policy still needed before store submission.
