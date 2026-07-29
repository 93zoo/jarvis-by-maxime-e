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
  level: number;
  xp: number;
  xpToNextLevel: number;
  gold: number;
  forgeLevel: number;
  skills: Record<SkillType, number>;
  skillXP: Record<SkillType, number>;
  talentsUnlocked: string[];
  totalItemsCrafted: number;
  totalGoldEarned: number;
  totalPlayTime: number;
  createdAt: number;
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

export interface CraftOrder {
  id: string;
  npcName: string;
  npcType: string;
  requestedCategory: ItemCategory;
  requestedName: string;
  minQuality: Quality;
  deadline: number;
  goldReward: number;
  xpReward: number;
  accepted: boolean;
  completed: boolean;
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
  unlockedRegions: string[];
  regionExploration: Record<string, number>;
  lastSaved: number;
}
