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
  talentPoints: number;
  totalItemsCrafted: number;
  totalGoldEarned: number;
  totalPlayTime: number;
  totalOrdersDelivered: number;
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
}

export interface InventoryItem {
  resourceId: string;
  quantity: number;
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
// Forge history (persistent — never removed when items are sold)
// ---------------------------------------------------------------------------
export interface ForgeHistoryEntry {
  instanceId: string;
  name: string;
  category: ItemCategory;
  quality: Quality;
  qualityScore: number;
  value: number;
  craftedAt: number;
}

// ---------------------------------------------------------------------------
// Save file
// ---------------------------------------------------------------------------
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
  lastSaved: number;
}
