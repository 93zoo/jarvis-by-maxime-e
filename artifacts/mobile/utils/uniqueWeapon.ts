/**
 * uniqueWeapon — procedural unique-trait generation for crafted items.
 *
 * Every crafted item receives a random seed at forge time; all visual and
 * cosmetic traits (blade shape, guard, handle, engraving, steel tint) plus a
 * unique epithet and small stat variance derive deterministically from that
 * seed. Two players will virtually never forge the same piece.
 */
import type { ItemCategory, ItemStats } from '@/types/game';

export interface UniqueTraits {
  seed: number;
  /** Shape/form descriptor, category-specific (e.g. "lame ondulée"). */
  form: string;
  /** Guard / rim / fitting descriptor. */
  fitting: string;
  /** Handle / strap / band material descriptor. */
  grip: string;
  /** Engraving motif carved into the piece. */
  engraving: string;
  /** Hex tint of the steel/metal. */
  steelTint: string;
  /** Unique epithet appended to the item name. */
  epithet: string;
  /** Per-stat variance multipliers applied at craft (0.92–1.08). */
  variancePct: number;
}

// ─── Seeded PRNG (mulberry32) ────────────────────────────────────────────────
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

// ─── Trait pools (French) ────────────────────────────────────────────────────
const FORMS: Partial<Record<ItemCategory, readonly string[]>> = {
  sword: ['lame droite', 'lame ondulée', 'lame effilée', 'lame large', 'lame courbée', 'lame à gouttière', 'lame à double tranchant'],
  axe: ['fer croissant', 'fer à barbe', 'double fer', 'fer étroit', 'fer massif', 'fer à bec'],
  hammer: ['tête carrée', 'tête ronde', 'tête à panne', 'tête crénelée', 'tête massive'],
  lance: ['pointe losange', 'pointe à ailettes', 'pointe torsadée', 'pointe barbelée', 'pointe fine'],
  dagger: ['lame stylet', 'lame courbe', 'lame à cran', 'lame double', 'lame flamboyante'],
  shield: ['écu en amande', 'rond à umbo', 'pavois cintré', 'targe octogonale', 'écu à pointe'],
  armor: ['plates rivetées', 'écailles imbriquées', 'mailles serrées', 'cuirasse bombée', 'lamelles articulées'],
  helmet: ['cimier haut', 'visière fendue', 'bassinet pointu', 'timbre arrondi', 'cornes courtes'],
  ring: ['anneau torsadé', 'anneau facetté', 'anneau serti', 'anneau gravé', 'anneau bombé'],
  amulet: ['médaillon ovale', 'pendentif ciselé', 'talisman ajouré', 'camée sculpté', 'sceau ancien'],
  crown: ['fleurons hauts', 'cercle simple', 'arches croisées', 'pointes étoilées'],
  tool: ['manche long', 'tête renforcée', 'profil compact', 'double usage'],
  decoration: ['motif floral', 'motif solaire', 'motif entrelacé', 'motif animalier'],
};
const DEFAULT_FORMS = ['facture classique', 'facture élancée', 'facture massive', 'facture raffinée'] as const;

const FITTINGS = ['garde en croix', 'garde en corbeille', 'garde à quillons recourbés', 'rebord doré', 'monture d\u2019argent', 'ferrure de bronze', 'sertissure d\u2019acier bleui', 'bordure ciselée'] as const;

const GRIPS = ['cuir tressé', 'fil d\u2019argent', 'bois de frêne', 'os poli', 'écailles de wyverne', 'soie cirée', 'corne sombre', 'ivoire strié'] as const;

const ENGRAVINGS = ['runes anciennes', 'un dragon lové', 'des flammes stylisées', 'un serment gravé', 'des étoiles filantes', 'un loup hurlant', 'des vagues entrelacées', 'un soleil couchant', 'une devise oubliée', 'des ronces d\u2019acier', 'un corbeau en vol', 'la marque du forgeron'] as const;

const STEEL_TINTS = ['#C8CDD4', '#AEB8C8', '#D8C9A3', '#B08D57', '#8FA8B8', '#C0A9D8', '#9FB89A', '#D89A9A', '#7E8B9E', '#E0D5B8'] as const;

const EPITHET_A = ['Murmure', 'Fureur', 'Serment', 'Éclat', 'Morsure', 'Chant', 'Veille', 'Écho', 'Fléau', 'Gloire', 'Larme', 'Souffle'] as const;
const EPITHET_B = ['du Nord', 'des Braises', 'de l\u2019Aube', 'du Crépuscule', 'des Tempêtes', 'du Roi Déchu', 'des Profondeurs', 'de la Lune', 'des Cendres', 'de l\u2019Hiver', 'du Dragon', 'des Anciens'] as const;

// ─── Generation ──────────────────────────────────────────────────────────────
export function makeUniqueSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

export function generateUniqueTraits(seed: number, category: ItemCategory): UniqueTraits {
  const rng = mulberry32(seed);
  return {
    seed,
    form: pick(rng, FORMS[category] ?? DEFAULT_FORMS),
    fitting: pick(rng, FITTINGS),
    grip: pick(rng, GRIPS),
    engraving: pick(rng, ENGRAVINGS),
    steelTint: pick(rng, STEEL_TINTS),
    epithet: `${pick(rng, EPITHET_A)} ${pick(rng, EPITHET_B)}`,
    variancePct: Math.round((0.92 + rng() * 0.16) * 100) / 100, // 0.92–1.08
  };
}

/** Apply the unique variance to already quality-scaled stats. */
export function applyUniqueVariance(stats: ItemStats, traits: UniqueTraits): ItemStats {
  const out: ItemStats = {};
  (Object.keys(stats) as (keyof ItemStats)[]).forEach((k) => {
    const v = stats[k];
    if (typeof v === 'number') out[k] = Math.max(1, Math.round(v * traits.variancePct));
  });
  return out;
}

/** Unique display name, e.g. « Épée longue "Murmure du Nord" ». */
export function uniqueName(baseName: string, traits: UniqueTraits): string {
  return `${baseName} « ${traits.epithet} »`;
}
