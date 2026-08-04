/**
 * Procedural "micro-combo" generation.
 *
 * Deterministically generates small 2-item combos ("Découvertes") between
 * recipes of complementary categories (e.g. sword + shield = "Duo Défensif").
 * Each combo's name and bonus (type + value) are derived from a hash of the
 * two recipe IDs, so every player sees the exact same combos without any of
 * them being hand-authored or stored in a save file.
 */
import type { RecipeData } from '@/types/game';

// Static data – lazily loaded on first access to avoid blocking the JS thread
let _cache_recipes_data: any;
const getRecipesData = () => (_cache_recipes_data ??= require('@/data/recipes.json'));
let _cache_collections_data: any;
const getCollectionsData = () => (_cache_collections_data ??= require('@/data/collections.json'));

const getAllRecipes = (): RecipeData[] => {
  const d = getRecipesData();
  return d.recipes ?? d;
};

interface MicroComboPairConfig {
  categories: [string, string];
  label: string;
  icon: string;
}

const getPairConfigs = (): MicroComboPairConfig[] => getCollectionsData().microCombos?.pairs ?? [];
const getEpithets = (): string[] => getCollectionsData().microCombos?.epithets ?? [''];
const getBonusTypes = (): string[] => getCollectionsData().microCombos?.bonusTypes ?? ['forgeXpBonus'];

export interface MicroCombo {
  id: string;
  name: string;
  icon: string;
  /** The two recipe IDs, sorted alphabetically. */
  items: [string, string];
  bonus: { type: string; value: number };
}

/** FNV-1a 32-bit hash — stable across platforms/JS engines. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function buildCombo(a: string, b: string, config: MicroComboPairConfig): MicroCombo {
  // Sort so hash & id are order-independent.
  const [idA, idB] = a < b ? [a, b] : [b, a];
  const hash = fnv1a(`${idA}|${idB}`);
  const bonusTypes = getBonusTypes();
  const bonusType = bonusTypes[hash % bonusTypes.length];
  // qualityBonus is a flat point; percentage bonuses range 2–5%.
  const value = bonusType === 'qualityBonus' ? 1 : 2 + ((hash >>> 3) % 4);
  const epithets = getEpithets();
  const epithet = epithets[(hash >>> 7) % epithets.length];
  return {
    id: `combo_${idA}__${idB}`,
    name: `${config.label} ${epithet}`.trim(),
    icon: config.icon,
    items: [idA, idB],
    bonus: { type: bonusType, value },
  };
}

function generateAllMicroCombos(): MicroCombo[] {
  const byCategory = new Map<string, RecipeData[]>();
  for (const r of getAllRecipes()) {
    const list = byCategory.get(r.category) ?? [];
    list.push(r);
    byCategory.set(r.category, list);
  }
  const combos: MicroCombo[] = [];
  for (const config of getPairConfigs()) {
    const [catA, catB] = config.categories;
    for (const ra of byCategory.get(catA) ?? []) {
      for (const rb of byCategory.get(catB) ?? []) {
        combos.push(buildCombo(ra.id, rb.id, config));
      }
    }
  }
  return combos;
}

/** All procedurally generated micro-combos (deterministic, same for everyone). */
let _cache_micro_combos: MicroCombo[] | undefined;
export function getAllMicroCombos(): MicroCombo[] {
  return (_cache_micro_combos ??= generateAllMicroCombos());
}

/** A combo is discovered once BOTH of its items have been forged at least once. */
export function isComboDiscovered(combo: MicroCombo, craftedIds: Set<string>): boolean {
  return craftedIds.has(combo.items[0]) && craftedIds.has(combo.items[1]);
}

/** Sum of active (discovered) micro-combo bonuses for a given bonus type. */
export function computeMicroComboBonus(bonusType: string, craftedIds: Set<string>): number {
  let total = 0;
  for (const combo of getAllMicroCombos()) {
    if (combo.bonus.type === bonusType && isComboDiscovered(combo, craftedIds)) {
      total += combo.bonus.value;
    }
  }
  return total;
}
