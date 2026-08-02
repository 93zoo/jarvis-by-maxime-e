// =============================================================================
// FORGE & KINGDOMS — Guilde des Travailleurs (Idle Worker System)
// =============================================================================

export type WorkerType = 'miner' | 'lumberjack' | 'elite_miner' | 'elite_lumberjack';

export interface WorkerResourceEntry {
  resourceId: string;
  /** Relative probability weight */
  weight: number;
  minQty: number;
  maxQty: number;
  /** Minimum worker level required to yield this resource */
  minWorkerLevel: number;
}

export interface WorkerDef {
  type: WorkerType;
  emoji: string;
  name: string;
  description: string;
  hireCost: number;
  /** True for premium workers sold in the Boutique */
  isElite?: boolean;
  /** Base worker type this elite variant belongs to (for grouping in UI) */
  baseType?: 'miner' | 'lumberjack';
  /** Gold cost to upgrade from level N to N+1 (index 0 = lvl 1→2) */
  upgradeCosts: number[];
  /** XP required to reach each level — index 0 = XP for level 1→2 */
  xpThresholds: number[];
  /** Base harvest rolls per hour at speed multiplier 1× */
  baseRollsPerHour: number;
  /** Speed multiplier per level (index 0 = level 1) */
  speedPerLevel: number[];
  /** Max units carried before cap is reached, per level (index 0 = level 1) */
  carryPerLevel: number[];
  /** Worker XP earned per hour of work, scaled by worker level */
  xpPerHour: number;
  /** Probability (0–1) that a collection includes a bonus rare find */
  bonusEventChance: number;
  /** Primary resources this worker can harvest */
  resources: WorkerResourceEntry[];
  /** Bonus/rare resources (only granted on bonus events) */
  bonusResources: WorkerResourceEntry[];
}

// ---------------------------------------------------------------------------
// Worker definitions
// ---------------------------------------------------------------------------
export const WORKER_DEFINITIONS: Record<WorkerType, WorkerDef> = {
  miner: {
    type: 'miner',
    emoji: '⛏️',
    name: 'Mineur',
    description: 'Extrait du fer, du charbon et des minerais précieux dans les profondeurs des mines.',
    hireCost: 300,
    upgradeCosts: [150, 350, 650, 1100, 1800, 2800, 4200, 6000, 8500],
    xpThresholds: [100, 200, 370, 600, 900, 1300, 1850, 2600, 3600],
    baseRollsPerHour: 6,
    speedPerLevel: [1.0, 1.12, 1.25, 1.40, 1.57, 1.75, 1.95, 2.15, 2.40, 2.70],
    carryPerLevel:  [40,  55,   72,   92,  115,  145,  180,  220,  270,  350],
    xpPerHour: 18,
    bonusEventChance: 0.15,
    resources: [
      { resourceId: 'coal',     weight: 35, minQty: 2, maxQty: 5, minWorkerLevel: 1 },
      { resourceId: 'iron',     weight: 40, minQty: 2, maxQty: 4, minWorkerLevel: 1 },
      { resourceId: 'copper',   weight: 25, minQty: 1, maxQty: 3, minWorkerLevel: 2 },
      { resourceId: 'bronze',   weight: 20, minQty: 1, maxQty: 2, minWorkerLevel: 4 },
      { resourceId: 'silver',   weight: 15, minQty: 1, maxQty: 2, minWorkerLevel: 5 },
      { resourceId: 'gold_ore', weight: 10, minQty: 1, maxQty: 1, minWorkerLevel: 7 },
      { resourceId: 'platinum', weight: 5,  minQty: 1, maxQty: 1, minWorkerLevel: 9 },
    ],
    bonusResources: [
      { resourceId: 'ruby',     weight: 40, minQty: 1, maxQty: 1, minWorkerLevel: 3 },
      { resourceId: 'amethyst', weight: 30, minQty: 1, maxQty: 1, minWorkerLevel: 3 },
      { resourceId: 'topaz',    weight: 20, minQty: 1, maxQty: 1, minWorkerLevel: 5 },
      { resourceId: 'sapphire', weight: 10, minQty: 1, maxQty: 1, minWorkerLevel: 7 },
    ],
  },

  lumberjack: {
    type: 'lumberjack',
    emoji: '🪓',
    name: 'Bûcheron',
    description: 'Abat des arbres et ramasse du bois de qualité dans les forêts du royaume.',
    hireCost: 250,
    upgradeCosts: [120, 280, 520, 900, 1500, 2400, 3600, 5200, 7200],
    xpThresholds: [100, 200, 370, 600, 900, 1300, 1850, 2600, 3600],
    baseRollsPerHour: 9,
    speedPerLevel: [1.0, 1.12, 1.25, 1.40, 1.57, 1.75, 1.95, 2.15, 2.40, 2.70],
    carryPerLevel:  [60,  80,   105,  135,  170,  210,  260,  315,  380,  480],
    xpPerHour: 15,
    bonusEventChance: 0.10,
    resources: [
      { resourceId: 'wood',  weight: 70, minQty: 3, maxQty: 6, minWorkerLevel: 1 },
      { resourceId: 'stone', weight: 20, minQty: 1, maxQty: 3, minWorkerLevel: 1 },
      { resourceId: 'clay',  weight: 10, minQty: 1, maxQty: 2, minWorkerLevel: 1 },
    ],
    bonusResources: [
      { resourceId: 'amethyst', weight: 50, minQty: 1, maxQty: 1, minWorkerLevel: 3 },
      { resourceId: 'crystal',  weight: 30, minQty: 1, maxQty: 1, minWorkerLevel: 5 },
      { resourceId: 'emerald',  weight: 20, minQty: 1, maxQty: 1, minWorkerLevel: 7 },
    ],
  },

  // ── Élite (vendus en Boutique) ──────────────────────────────────────────────
  elite_miner: {
    type: 'elite_miner',
    isElite: true,
    baseType: 'miner',
    emoji: '💎',
    name: 'Maître Mineur',
    description: 'Expert des profondeurs. Récolte 2× plus vite, porte plus lourd et découvre des gemmes bien plus souvent.',
    hireCost: 1500,
    upgradeCosts: [400, 900, 1600, 2700, 4400, 6800, 10000, 14000, 19000],
    xpThresholds: [80, 160, 300, 500, 750, 1100, 1550, 2200, 3100],
    baseRollsPerHour: 12,  // 2× standard
    speedPerLevel: [1.20, 1.35, 1.52, 1.70, 1.90, 2.12, 2.36, 2.62, 2.92, 3.30],
    carryPerLevel:  [70,  95,  125,  160,  200,  248,  304,  368,  440,  560],
    xpPerHour: 28,
    bonusEventChance: 0.30,  // 2× standard
    resources: [
      { resourceId: 'coal',     weight: 30, minQty: 3, maxQty: 7, minWorkerLevel: 1 },
      { resourceId: 'iron',     weight: 35, minQty: 3, maxQty: 6, minWorkerLevel: 1 },
      { resourceId: 'copper',   weight: 22, minQty: 2, maxQty: 4, minWorkerLevel: 1 },
      { resourceId: 'bronze',   weight: 18, minQty: 1, maxQty: 3, minWorkerLevel: 2 },
      { resourceId: 'silver',   weight: 14, minQty: 1, maxQty: 3, minWorkerLevel: 3 },
      { resourceId: 'gold_ore', weight: 10, minQty: 1, maxQty: 2, minWorkerLevel: 5 },
      { resourceId: 'platinum', weight: 6,  minQty: 1, maxQty: 2, minWorkerLevel: 7 },
    ],
    bonusResources: [
      { resourceId: 'ruby',     weight: 35, minQty: 1, maxQty: 2, minWorkerLevel: 1 },
      { resourceId: 'amethyst', weight: 28, minQty: 1, maxQty: 2, minWorkerLevel: 1 },
      { resourceId: 'topaz',    weight: 22, minQty: 1, maxQty: 2, minWorkerLevel: 3 },
      { resourceId: 'sapphire', weight: 15, minQty: 1, maxQty: 1, minWorkerLevel: 5 },
    ],
  },

  elite_lumberjack: {
    type: 'elite_lumberjack',
    isElite: true,
    baseType: 'lumberjack',
    emoji: '🌟',
    name: 'Maître Bûcheron',
    description: 'Forestier hors pair. Coupe 2× plus vite et ne rentre jamais les mains vides.',
    hireCost: 1200,
    upgradeCosts: [320, 720, 1300, 2200, 3600, 5700, 8500, 12000, 16500],
    xpThresholds: [80, 160, 300, 500, 750, 1100, 1550, 2200, 3100],
    baseRollsPerHour: 18,  // 2× standard
    speedPerLevel: [1.20, 1.35, 1.52, 1.70, 1.90, 2.12, 2.36, 2.62, 2.92, 3.30],
    carryPerLevel:  [100, 134, 175, 222, 280, 346, 424, 514, 622, 784],
    xpPerHour: 24,
    bonusEventChance: 0.22,  // 2× standard
    resources: [
      { resourceId: 'wood',  weight: 65, minQty: 5, maxQty: 10, minWorkerLevel: 1 },
      { resourceId: 'stone', weight: 20, minQty: 2, maxQty: 5,  minWorkerLevel: 1 },
      { resourceId: 'clay',  weight: 15, minQty: 2, maxQty: 4,  minWorkerLevel: 1 },
    ],
    bonusResources: [
      { resourceId: 'amethyst', weight: 45, minQty: 1, maxQty: 2, minWorkerLevel: 1 },
      { resourceId: 'crystal',  weight: 30, minQty: 1, maxQty: 2, minWorkerLevel: 3 },
      { resourceId: 'emerald',  weight: 25, minQty: 1, maxQty: 2, minWorkerLevel: 5 },
    ],
  },
};

/** Maximum offline accumulation time in ms (8 hours) */
export const MAX_OFFLINE_MS = 8 * 60 * 60 * 1000;

/** Minimum elapsed time (ms) before showing the return recap modal */
export const MIN_RECAP_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------------------
// Harvest computation (pure function — no side effects)
// ---------------------------------------------------------------------------
export interface WorkerHarvestResult {
  resources: { resourceId: string; qty: number }[];
  bonusResource?: { resourceId: string; qty: number };
  workerXpEarned: number;
  playerXpEarned: number;
  /** Actual elapsed time used for calculation (capped at MAX_OFFLINE_MS) */
  elapsedMs: number;
  leveledUp: boolean;
  newLevel: number;
  newXp: number;
}

/** Weighted random pick from eligible entries */
function weightedPick(entries: WorkerResourceEntry[]): WorkerResourceEntry {
  const total = entries.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}

export function computeWorkerHarvest(
  workerLevel: number,
  workerXp: number,
  workerType: WorkerType,
  lastClaimedAt: number,
  nowMs: number,
): WorkerHarvestResult {
  const def = WORKER_DEFINITIONS[workerType];
  const lvlIdx = Math.min(workerLevel - 1, def.speedPerLevel.length - 1);
  const speedMult = def.speedPerLevel[lvlIdx];
  const carryCap = def.carryPerLevel[lvlIdx];

  const elapsedMs = Math.min(nowMs - lastClaimedAt, MAX_OFFLINE_MS);

  // Minimum 60 s of real elapsed time before any reward is granted.
  // This prevents infinite-XP exploits from repeated rapid collections.
  if (elapsedMs < 60_000) {
    return {
      resources: [],
      workerXpEarned: 0,
      playerXpEarned: 0,
      elapsedMs,
      leveledUp: false,
      newLevel: workerLevel,
      newXp: workerXp,
    };
  }

  const elapsedHours = elapsedMs / 3_600_000;

  const eligibleRes = def.resources.filter((r) => r.minWorkerLevel <= workerLevel);
  const totalRolls = Math.floor(elapsedHours * def.baseRollsPerHour * speedMult);

  const gathered: Record<string, number> = {};
  let totalUnits = 0;

  for (let i = 0; i < totalRolls && totalUnits < carryCap; i++) {
    if (eligibleRes.length === 0) break;
    const entry = weightedPick(eligibleRes);
    const qty = Math.floor(Math.random() * (entry.maxQty - entry.minQty + 1)) + entry.minQty;
    const actual = Math.min(qty, carryCap - totalUnits);
    gathered[entry.resourceId] = (gathered[entry.resourceId] ?? 0) + actual;
    totalUnits += actual;
  }

  // Bonus event (rare find)
  let bonusResource: { resourceId: string; qty: number } | undefined;
  const eligibleBonus = def.bonusResources.filter((r) => r.minWorkerLevel <= workerLevel);
  if (elapsedMs >= MIN_RECAP_MS && eligibleBonus.length > 0 && Math.random() < def.bonusEventChance) {
    const entry = weightedPick(eligibleBonus);
    const qty = Math.floor(Math.random() * (entry.maxQty - entry.minQty + 1)) + entry.minQty;
    bonusResource = { resourceId: entry.resourceId, qty };
  }

  // XP calculation — strictly proportional to elapsed time, no minimum guarantee.
  const workerXpEarned = Math.round(elapsedHours * def.xpPerHour * workerLevel);
  const playerXpEarned = Math.round(elapsedHours * 3);

  // Level up check
  let newXp = workerXp + workerXpEarned;
  let newLevel = workerLevel;
  let leveledUp = false;
  while (newLevel < 10) {
    const threshold = def.xpThresholds[newLevel - 1];
    if (newXp >= threshold) {
      newXp -= threshold;
      newLevel++;
      leveledUp = true;
    } else {
      break;
    }
  }

  return {
    resources: Object.entries(gathered).map(([resourceId, qty]) => ({ resourceId, qty })),
    bonusResource,
    workerXpEarned,
    playerXpEarned,
    elapsedMs,
    leveledUp,
    newLevel,
    newXp,
  };
}
