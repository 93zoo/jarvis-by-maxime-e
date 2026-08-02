/**
 * Catalogue des événements de marché de l'Hôtel des Ventes.
 *
 * Chaque type d'événement déclare ses multiplicateurs par ItemCategory et/ou
 * par Rarity, son icône Ionicons, sa couleur thématique et son poids de tirage.
 */

import type { ItemCategory, Rarity } from '@/types/game';

export interface MarketEventType {
  id: string;
  /** Label court affiché dans le badge actif. */
  label: string;
  /** Description complète pour le bandeau de notification. */
  bannerText: string;
  /** Ionicons icon name. */
  icon: string;
  /** Couleur thématique (hex). */
  color: string;
  /** Poids de tirage (plus élevé = plus fréquent). */
  weight: number;
  /** Multiplicateurs appliqués aux prix selon la catégorie d'objet. */
  categoryMultipliers?: Partial<Record<ItemCategory, number>>;
  /** Multiplicateurs appliqués aux prix selon la rareté. */
  rarityMultipliers?: Partial<Record<Rarity, number>>;
  /** Durée de l'événement en ms (si absent, utilise EVENT_DEFAULT_DURATION_MS). */
  durationMs?: number;
}

export const MARKET_EVENT_TYPES: MarketEventType[] = [
  {
    id: 'war_declared',
    label: 'Guerre déclarée',
    bannerText: 'Guerre déclarée — les armes se vendent +40 % pendant 10 min !',
    icon: 'flash',
    color: '#FF4444',
    weight: 3,
    categoryMultipliers: {
      sword:   1.40,
      axe:     1.40,
      lance:   1.40,
      dagger:  1.30,
      hammer:  1.25,
      shield:  1.20,
      armor:   1.15,
      helmet:  1.15,
    },
  },
  {
    id: 'grand_tournament',
    label: 'Grand Tournoi',
    bannerText: 'Grand Tournoi annoncé — les armures et boucliers sont très recherchés !',
    icon: 'trophy',
    color: '#FFD700',
    weight: 3,
    categoryMultipliers: {
      armor:   1.50,
      shield:  1.45,
      helmet:  1.40,
      sword:   1.20,
      lance:   1.15,
    },
  },
  {
    id: 'collector_in_town',
    label: 'Collectionneur',
    bannerText: 'Collectionneur en ville — les objets légendaires et épiques valent beaucoup plus !',
    icon: 'diamond',
    color: '#AA44FF',
    weight: 2,
    rarityMultipliers: {
      legendary: 1.80,
      epic:      1.60,
      rare:      1.25,
    },
  },
  {
    id: 'royal_commission',
    label: 'Commande Royale',
    bannerText: 'Commande Royale — les objets épiques et légendaires sont fortement demandés !',
    icon: 'star',
    color: '#FFB700',
    weight: 2,
    rarityMultipliers: {
      legendary: 1.70,
      epic:      1.60,
    },
    categoryMultipliers: {
      crown:    1.80,
      amulet:   1.50,
      ring:     1.40,
    },
  },
  {
    id: 'market_saturation_tools',
    label: 'Saturation outils',
    bannerText: 'Le marché est saturé — les prix des outils diminuent temporairement.',
    icon: 'trending-down',
    color: '#888888',
    weight: 2,
    categoryMultipliers: {
      tool:        0.80,
      decoration:  0.85,
    },
  },
  {
    id: 'thieves_guild',
    label: 'Guilde des Ombres',
    bannerText: 'La Guilde des Ombres recrute — dagues et protections légères très demandées.',
    icon: 'eye-off',
    color: '#445566',
    weight: 2,
    categoryMultipliers: {
      dagger: 1.35,
      ring:   1.25,
      amulet: 1.20,
    },
  },
  {
    id: 'cold_winter',
    label: 'Hiver Rigoureux',
    bannerText: 'Hiver rigoureux — les armures lourdes et coiffures protectrices se vendent mieux.',
    icon: 'snow',
    color: '#88CCFF',
    weight: 2,
    categoryMultipliers: {
      armor:   1.35,
      helmet:  1.40,
      shield:  1.20,
    },
  },
  {
    id: 'mine_collapse',
    label: 'Effondrement Minier',
    bannerText: 'Effondrement dans les mines — les armes de métal et outils de forge en forte hausse !',
    icon: 'hammer',
    color: '#CC8844',
    weight: 2,
    categoryMultipliers: {
      sword:  1.30,
      axe:    1.30,
      hammer: 1.40,
      tool:   1.35,
    },
  },
  {
    id: 'trade_fair',
    label: 'Foire Marchande',
    bannerText: 'Grande Foire Marchande — tous les objets de qualité se vendent mieux !',
    icon: 'storefront',
    color: '#44CC88',
    weight: 3,
    rarityMultipliers: {
      rare:      1.15,
      epic:      1.20,
      legendary: 1.25,
    },
  },
  {
    id: 'noble_festival',
    label: 'Fête Nobiliaire',
    bannerText: 'Fête à la cour — bijoux, couronnes et ornements sont très convoités !',
    icon: 'ribbon',
    color: '#FF88CC',
    weight: 2,
    categoryMultipliers: {
      crown:      1.70,
      ring:       1.50,
      amulet:     1.50,
      decoration: 1.40,
    },
  },
  {
    id: 'pirates_raid',
    label: 'Raid Pirate',
    bannerText: 'Les corsaires pillent les côtes — armes légères et défenses en forte demande !',
    icon: 'boat',
    color: '#4488CC',
    weight: 2,
    categoryMultipliers: {
      dagger: 1.40,
      sword:  1.25,
      shield: 1.30,
      armor:  1.20,
    },
  },
  {
    id: 'mage_conclave',
    label: 'Conclave des Mages',
    bannerText: 'Conclave des Mages — anneaux, amulettes et objets enchantables très recherchés.',
    icon: 'flask',
    color: '#8844FF',
    weight: 2,
    categoryMultipliers: {
      ring:   1.55,
      amulet: 1.55,
      crown:  1.45,
    },
  },
];

/** Sélectionne un type d'événement aléatoire selon les poids. */
export function pickRandomMarketEventType(): MarketEventType {
  const total = MARKET_EVENT_TYPES.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const ev of MARKET_EVENT_TYPES) {
    r -= ev.weight;
    if (r <= 0) return ev;
  }
  return MARKET_EVENT_TYPES[0];
}

/** Retourne le type d'événement par son ID. */
export function getMarketEventType(id: string): MarketEventType | undefined {
  return MARKET_EVENT_TYPES.find(e => e.id === id);
}
