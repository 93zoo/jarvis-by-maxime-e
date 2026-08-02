/**
 * Hôtel des Ventes — paramètres configurables
 *
 * Tous les coefficients, durées et probabilités sont centralisés ici.
 * Modifier ces valeurs pour rééquilibrer le jeu sans toucher au code métier.
 */

import type { ItemCategory, Quality, Rarity } from '@/types/game';

// ─── Durées d'enchère par rareté (ms) ────────────────────────────────────────

export const AUCTION_DURATION_BY_RARITY: Record<Rarity, number> = {
  common:    5  * 60_000,  //  5 min
  uncommon:  8  * 60_000,  //  8 min
  rare:      12 * 60_000,  // 12 min
  epic:      18 * 60_000,  // 18 min
  legendary: 25 * 60_000,  // 25 min
};

// ─── Multiplicateurs de prix par qualité ──────────────────────────────────────

export const QUALITY_PRICE_MULT: Record<Quality, number> = {
  poor:      0.50,
  normal:    0.80,
  good:      1.00,
  excellent: 1.50,
  legendary: 2.50,
};

// ─── Multiplicateurs de prix par rareté ──────────────────────────────────────

export const RARITY_PRICE_MULT: Record<Rarity, number> = {
  common:    0.90,
  uncommon:  1.00,
  rare:      1.20,
  epic:      1.50,
  legendary: 2.50,
};

// ─── Formule d'enchère ────────────────────────────────────────────────────────

/** item.value × ce facteur = prix de base avant modificateurs */
export const BASE_PRICE_FACTOR = 0.85;

/** Bonus de réputation par commande livrée (cumulatif) */
export const REPUTATION_BONUS_PER_ORDER = 0.003; // 0.3 % par commande

/** Plafond du bonus de réputation */
export const REPUTATION_BONUS_MAX = 0.30; // +30 % max

/** Facteur aléatoire bas (vente normale) */
export const RANDOM_FACTOR_MIN = 0.75;

/** Facteur aléatoire haut (vente normale) */
export const RANDOM_FACTOR_MAX = 1.35;

/** Probabilité de déclencher une "vente exceptionnelle" */
export const EXCEPTIONAL_CHANCE = 0.03; // 3 %

/** Facteur multiplicatif minimum lors d'une vente exceptionnelle */
export const EXCEPTIONAL_FACTOR_MIN = 2.0;

/** Facteur multiplicatif maximum lors d'une vente exceptionnelle */
export const EXCEPTIONAL_FACTOR_MAX = 4.0;

// ─── Timers ───────────────────────────────────────────────────────────────────

/** Fréquence de vérification des enchères terminées (ms) */
export const AUCTION_CHECK_INTERVAL_MS = 30_000; // 30 s

/** Nombre maximum de résultats conservés dans l'historique */
export const MAX_AUCTION_RESULTS = 20;

// ─── Événements de marché ─────────────────────────────────────────────────────

/** Intervalle minimum entre deux déclenchements d'événement (ms) */
export const EVENT_INTERVAL_MIN_MS = 5 * 60_000; // 5 min

/** Intervalle maximum entre deux déclenchements (ms) */
export const EVENT_INTERVAL_MAX_MS = 15 * 60_000; // 15 min

/** Durée par défaut d'un événement de marché (ms) */
export const EVENT_DEFAULT_DURATION_MS = 10 * 60_000; // 10 min

/** Nombre maximum d'événements actifs simultanément */
export const MAX_ACTIVE_EVENTS = 2;

/** Fréquence de vérification des événements (déclenchement + expiration) (ms) */
export const EVENT_CHECK_INTERVAL_MS = 60_000; // 60 s

// ─── Bandeau de notification ──────────────────────────────────────────────────

/** Durée du slide-in / slide-out (ms) */
export const BANNER_SLIDE_DURATION_MS = 350;

/** Durée d'affichage du bandeau avant dismiss (ms) */
export const BANNER_DISPLAY_MS = 4500;

/** Vitesse du texte défilant (px/s) */
export const BANNER_SCROLL_SPEED_PX_PER_S = 55;

/** Délai entre deux notifications dans la file d'attente (ms) */
export const BANNER_QUEUE_GAP_MS = 600;
