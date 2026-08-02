// =============================================================================
// FORGE & KINGDOMS — Type definitions (source of truth for all game entities)
// =============================================================================

export type SkillType =
  | 'forge'
  | 'extraction'
  | 'commerce'
  | 'construction'
  | 'enchantment'
  | 'cooking'
  | 'harvest'
  | 'combat';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
export type Quality = 'poor' | 'normal' | 'good' | 'excellent' | 'legendary';
export type ItemCategory =
  | 'sword'
  | 'axe'
  | 'hammer'
  | 'lance'
  | 'shield'
  | 'armor'
  | 'helmet'
  | 'ring'
  | 'amulet'
  | 'dagger'
  | 'crown'
  | 'tool'
  | 'decoration';
export type ResourceType = 'metal' | 'wood' | 'stone' | 'clay' | 'gem' | 'organic' | 'misc';
export type GemType =
  | 'ruby'
  | 'sapphire'
  | 'diamond'
  | 'emerald'
  | 'topaz'
  | 'amethyst'
  | 'onyx';

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------
export interface Player {
  id: string;
  name: string;
  forgeName: string;
  level: number;
  xp: number;
  xpToNextLevel: number;
  gold: number;
  forgeLevel: number;
  skills: Record<SkillType, number>;
  skillXP: Record<SkillType, number>;
  talentsUnlocked: string[];
  /** Recipe blueprints the player has purchased or received. */
  unlockedRecipeIds: string[];
  talentPoints: number;
  totalItemsCrafted: number;
  totalGoldEarned: number;
  totalPlayTime: number;
  totalOrdersDelivered: number;
  /** Lifetime cumulative player (forgeron) XP earned — never resets on level-up. Used for leaderboard points. */
  totalPlayerXPEarned: number;
  /** Lifetime cumulative forge-skill XP earned — never resets on skill level-up. Used for leaderboard points. */
  totalForgeXPEarned: number;
  totalQuestsAccepted: number;
  craftedLegendaryCount: number;
  craftedExcellentCount: number;
  craftedGoodCount: number;
  createdAt: number;
  streak: number;
  lastPlayedDate: number;
  bestSalePrice: number;
  bestQualityScore: number;
  /** Hex color for the avatar circle. Defaults to amber if absent. */
  avatarColor?: string;
  /** Feather icon name shown in the avatar circle. Null/absent = show initials. */
  avatarIcon?: string | null;
  /** Preset avatar illustration key (e.g. 'knight', 'mage'). When set, overrides color+icon display. */
  avatarImage?: string | null;
  /**
   * Permanent stat upgrades purchased with gold.
   * Keys match STAT_UPGRADE_DEFINITIONS ids in GameContext.
   */
  statUpgrades?: Record<string, number>;
}

// ── Achievement system ────────────────────────────────────────────────────────
export type AchievementCategory = 'craft' | 'economy' | 'exploration' | 'progression' | 'special';

export type AchievementConditionType =
  | 'totalItemsCrafted'
  | 'totalGoldEarned'
  | 'goldCurrent'
  | 'questsCompleted'
  | 'questsAccepted'
  | 'regionsUnlocked'
  | 'talentsUnlocked'
  | 'ordersDelivered'
  | 'craftQuality'
  | 'forgeUpgradeLevels'
  | 'talentPoints'
  | 'playerLevel'
  | 'skillLevel'
  | 'inventoryItems'
  | 'achievementsUnlocked';

export interface AchievementCondition {
  type: AchievementConditionType;
  value: number;
  skill?: SkillType;
  quality?: Quality;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  condition: AchievementCondition;
  reward?: { xp?: number; gold?: number };
}

// ---------------------------------------------------------------------------
// Static data loaded from JSON files
// ---------------------------------------------------------------------------
export interface ResourceData {
  id: string;
  name: string;
  description: string;
  type: ResourceType;
  level: number;
  weight: number;
  purity: number;
  rarity: Rarity;
  quality: Quality;
  baseValue: number;
  color: string;
}

export interface RecipeRequirement {
  resourceId: string;
  quantity: number;
}

export interface ItemStats {
  attack?: number;
  defense?: number;
  speed?: number;
  luck?: number;
  magic?: number;
}

export interface ItemBase {
  name: string;
  description: string;
  lore: string;
  category: ItemCategory;
  baseStats: ItemStats;
  gemSlots: number;
  weight: number;
  durabilityBase: number;
  valueMultiplier: number;
}

export interface RecipeData {
  id: string;
  name: string;
  description: string;
  category: ItemCategory;
  requirements: RecipeRequirement[];
  skillRequired: SkillType;
  levelRequired: number;
  baseTime: number;
  xpReward: number;
  outputItemBase: ItemBase;
}

export interface GemData {
  id: string;
  name: string;
  type: GemType;
  level: number;
  rarity: Rarity;
  color: string;
  effects: string[];
  bonusValue: number;
}

export interface RegionResourceNode {
  resourceId: string;
  dropRate: number;
  minQty: number;
  maxQty: number;
}

export interface RegionBoss {
  name: string;
  level: number;
  description: string;
}

export interface RegionEnemy {
  id: string;
  name: string;
  level: number;
  description: string;
  drops: RegionResourceNode[];
}

export interface RegionHideoutReward {
  resourceId: string;
  minQty: number;
  maxQty: number;
}
export interface RegionData {
  id: string;
  name: string;
  description: string;
  levelRequired: number;
  biome: string;
  icon: string;
  resourceNodes: RegionResourceNode[];
  boss: RegionBoss;
  questIds: string[];
  /** Short lore snippets shown as toasts while exploring the region. */
  lore?: string[];
  /** Hideout slots that spawn periodically in this region. */
  hideouts?: RegionHideoutSlot[];
  /** Secondary enemies (guards, mini-bosses) encountered while exploring. */
  enemies?: RegionEnemy[];
}

export interface SkillUnlock {
  level: number;
  reward: string;
}

export interface SkillData {
  id: SkillType;
  name: string;
  description: string;
  icon: string;
  color: string;
  unlocks: SkillUnlock[];
}

// ---------------------------------------------------------------------------
// Runtime game objects
// ---------------------------------------------------------------------------
/** Procedurally generated unique traits — see utils/uniqueWeapon.ts */
export interface UniqueItemTraits {
  seed: number;
  form: string;
  fitting: string;
  grip: string;
  engraving: string;
  steelTint: string;
  epithet: string;
  variancePct: number;
}

export interface Item {
  instanceId: string;
  recipeId: string;
  name: string;
  description: string;
  lore: string;
  category: ItemCategory;
  level: number;
  quality: Quality;
  rarity: Rarity;
  durability: number;
  maxDurability: number;
  weight: number;
  value: number;
  stats: ItemStats;
  gemSlots: number;
  gems: (GemData | null)[];
  materials: string[];
  craftedBy: string;
  craftedAt: number;
  qualityScore: number;
  /** Unique procedurally generated traits (absent on items from old saves). */
  unique?: UniqueItemTraits;
  /** True when this item was crafted with a successful forge enigma bonus (quality bumped one tier). */
  enigmaMastered?: boolean;
}

export interface InventoryItem {
  resourceId: string;
  quantity: number;
}

export interface CombatDrop {
  resourceId: string;
  quantity: number;
}

export interface CombatResult {
  won: boolean;
  playerRoll: number;
  enemyRoll: number;
  drops: CombatDrop[];
  message: string;
}

export interface QuestObjective {
  id: string;
  description: string;
  type: 'craft' | 'collect' | 'sell' | 'deliver';
  targetId: string;
  required: number;
  current: number;
}

export interface Quest {
  id: string;
  regionId: string;
  /** Minimum player level required to see and accept this quest (defaults to 0). */
  unlockLevel?: number;
  title: string;
  description: string;
  objectives: QuestObjective[];
  rewards: { gold: number; xp: number; unlockRegion?: string };
  completed: boolean;
}

export interface NPCData {
  id: string;
  name: string;
  type: 'merchant' | 'knight' | 'adventurer' | 'soldier' | 'noble' | 'king';
  emoji: string;
  personality: 'demanding' | 'generous' | 'casual' | 'impatient';
  budgetMin: number;
  budgetMax: number;
  preferredCategories: ItemCategory[];
  minQuality: Quality;
  dialogues: {
    greeting: string;
    satisfied: string;
    excellent: string;
    disappointed: string;
    angry: string;
  };
}

export interface CraftOrder {
  id: string;
  npcId: string;
  npcName: string;
  npcType: string;
  npcEmoji: string;
  requestedCategory: ItemCategory;
  requestedName: string;
  minQuality: Quality;
  deadline: number;
  goldReward: number;
  xpReward: number;
  reputationReward: number;
  accepted: boolean;
  completed: boolean;
  /** True for time-sensitive urgent orders (10–30 min real-time countdown). */
  isUrgent?: boolean;
  /** Extra gold awarded if delivered before deadline (urgent orders only). */
  urgentBonusGold?: number;
  /** Extra XP awarded if delivered before deadline (urgent orders only). */
  urgentBonusXp?: number;
}

// ---------------------------------------------------------------------------
// Talents & forge upgrades
// ---------------------------------------------------------------------------
export interface TalentData {
  id: string;
  name: string;
  description: string;
  effect: string;
  tree: 'forge' | 'extraction' | 'commerce' | 'construction' | 'universal';
  tier: number;
  col: number;
  requiredSkill: SkillType | null;
  requiredSkillLevel: number;
  prerequisiteIds: string[];
  icon: string;
  cost: number;
}

export type ForgeUpgradeElement = 'forge' | 'furnace' | 'anvil' | 'workbench' | 'decoration' | 'storage';

export interface ForgeUpgradeTier {
  level: number;
  goldCost: number;
  resourceCosts: { resourceId: string; qty: number }[];
  bonus: string;
}

export interface ForgeUpgradeData {
  id: ForgeUpgradeElement;
  name: string;
  description: string;
  emoji: string;
  color: string;
  tiers: ForgeUpgradeTier[];
}

// ---------------------------------------------------------------------------
// Session snapshot (one per play session, kept for up to 30 entries)
// ---------------------------------------------------------------------------
export interface SessionSnapshot {
  timestamp: number;
  playerLevel: number;
  gold: number;
  totalItemsCrafted: number;
  forgeLevel: number;
  /** Per-skill levels at the time of the snapshot. Optional for backward compat — absent on old saves. */
  skills?: Record<SkillType, number>;
}

// ---------------------------------------------------------------------------
// Collections / Sets system
// ---------------------------------------------------------------------------
export type SetBonusType =
  | 'orderGoldBonus'
  | 'reputationBonus'
  | 'qualityBonus'
  | 'forgeXpBonus'
  | 'dropBonus'
  | 'craftSpeedBonus'
  | 'marketValueBonus';

export interface SetBonusEffect {
  type: SetBonusType;
  /** Percentage for multiplier bonuses; flat points for qualityBonus */
  value: number;
}

export interface SetBonusTier {
  count: number;
  label: string;
  effects: SetBonusEffect[];
}

/** Temporary rotating event that unlocks an exclusive collection combo. */
export interface CollectionEvent {
  id: string;
  name: string;
  theme: string;
  icon: string;
  description: string;
  items: string[];
  bonuses: SetBonusTier[];
}

export interface ItemSet {
  id: string;
  name: string;
  theme: string;
  emoji: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
  secret: boolean;
  description: string;
  items: string[];
  bonuses: SetBonusTier[];
  reward: { gold: number; title: string };
}

// ---------------------------------------------------------------------------
// Forge history (persistent — never removed when items are sold)
// ---------------------------------------------------------------------------
export interface ForgeHistoryEntry {
  instanceId: string;
  /** Optional for backward compatibility with history entries from older saves. */
  recipeId?: string;
  name: string;
  category: ItemCategory;
  quality: Quality;
  qualityScore: number;
  value: number;
  craftedAt: number;
}

// ---------------------------------------------------------------------------
// Apprentice
// ---------------------------------------------------------------------------
export interface Apprentice {
  name: string;
  level: number;          // 1–10
  xp: number;
  xpToNextLevel: number;
  assignedRecipeId: string | null;
  craftStartedAt: number | null;  // timestamp ms
  craftDurationMs: number;        // ms to finish current craft
  readyItem: Item | null;         // finished item waiting to be collected
  /** Number of times a new item was finished while the previous readyItem was still uncollected. Resets to 0 on successful collection. At 3 the apprentice leaves. */
  missedPayments: number;
  /** Craft category this apprentice specialises in — quality is bumped one tier when crafting a matching recipe. */
  specialty: ItemCategory;
}

// ---------------------------------------------------------------------------
// Alloy / fusion system
// ---------------------------------------------------------------------------
export interface AlloyIngredient {
  resourceId: string;
  quantity: number;
}

export interface AlloyData {
  id: string;
  name: string;
  description: string;
  outputResourceId: string;
  outputQuantity: number;
  ingredients: AlloyIngredient[];
  fusionTimeSec: number;
  levelRequired: number;
  hint: string;
}

export interface StatUpgradeDefinition {
  id: string;
  name: string;
  description: string;
  emoji: string;
  color: string;
  maxLevel: number;
  /** Gold cost for each level (index 0 = cost to reach level 1). */
  costs: number[];
  /** Effect type used by getStatUpgradeBonus(). */
  effectType: string;
  /** Bonus per level (additive multiplied by level). */
  bonusPerLevel: number;
  /** Unit label shown in the UI (e.g. '%', 'kg', 'h'). */
  unit: string;
}
export interface SaveData {
  version: number;
  player: Player;
  inventory: InventoryItem[];
  craftedItems: Item[];
  activeOrders: CraftOrder[];
  completedQuestIds: string[];
  activeQuestIds: string[];
  questProgress: Record<string, Record<string, number>>;
  unlockedRegions: string[];
  regionExploration: Record<string, number>;
  npcReputation: Record<string, number>;
  marketPrices: Record<string, number>;
  lastOrderGeneratedAt: number;
  forgeUpgrades: Record<string, number>;
  forgeHistory: ForgeHistoryEntry[];
  sessionSnapshots: SessionSnapshot[];
  apprentice: Apprentice | null;
  completedRegions: string[];
  completedSets: string[];
  discoveredAlloyIds: string[];
  /** Instance IDs of items pinned to the showcase vitrine (max 6). */
  showcasedItemIds?: string[];
  /**
   * Undefined identifies a save made before the first-forge tutorial existed.
   * Those established games must never receive the tutorial retroactively.
   */
  hasCompletedFirstForgeTutorial?: boolean;
  /**
   * True once the player has completed their first real forge (post-tutorial
   * guided overlay). Undefined/false in old saves → defaults to craftedItems
   * count > 0 so established players skip the overlay.
   */
  hasCompletedFirstForge?: boolean;
  /** Currently active (spawned) hideouts across all regions. */
  activeHideouts?: ActiveHideout[];
  /** Per-slot last-collected timestamps for hideout spawn rate calculation. */
  hideoutLastCollected?: Record<string, number>;
  lastSaved: number;
}

export interface RegionHideoutSlot {
  id: string;
  spawnIntervalHours: number;
  rewardTable: RegionHideoutReward[];
}

/** A currently active (spawned) hideout on the world map. */
export interface ActiveHideout {
  regionId: string;
  slotId: string;
  spawnedAt: number;
  /** Timestamp after which the hideout expires and is removed. */
  expiresAt: number;
}
