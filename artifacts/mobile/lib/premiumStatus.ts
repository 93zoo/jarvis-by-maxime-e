/**
 * premiumStatus — module-level bridge so GameContext (below SubscriptionProvider
 * in the tree) can read the live premium entitlement without a context dependency.
 */
let active = false;

export function setPremiumActive(value: boolean) {
  active = value;
}

export function isPremiumActive(): boolean {
  return active;
}

/** Forge XP multiplier granted by Forge Premium. */
export function premiumXpMultiplier(): number {
  return active ? 2 : 1;
}
