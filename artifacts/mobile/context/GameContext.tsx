import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  Apprentice,
  CraftOrder,
  CombatDrop,
  CombatResult,
  ForgeHistoryEntry,
  ForgeUpgradeData,
  GemData,
  InventoryItem,
  Item,
  ItemCategory,
  ItemStats,
  NPCData,
  Player,
  Quality,
  Quest,
  Rarity,
  RecipeData,
  RegionData,
  ResourceData,
  SaveData,
  SessionSnapshot,
  SkillData,
  SkillType,
  TalentData,
} from '@/types/game';

// ---------------------------------------------------------------------------
// Static data (loaded once)
// ---------------------------------------------------------------------------
const ALL_RESOURCES: ResourceData[] = require('@/data/resources.json');
const ALL_RECIPES: RecipeData[] = require('@/data/recipes.json');
const ALL_REGIONS: RegionData[] = require('@/data/regions.json');
const ALL_SKILLS: SkillData[] = require('@/data/skills.json');
const ALL_GEMS: GemData[] = require('@/data/gems.json');
const ALL_NPCS: NPCData[] = require('@/data/npcs.json');
const ALL_QUESTS: Quest[] = require('@/data/quests.json');
const ALL_TALENTS: TalentData[] = require('@/data/talents.json');
const ALL_FORGE_UPGRADES: ForgeUpgradeData[] = require('@/data/forgeUpgrades.json');

/** Generate a random order from the NPC roster */
const QUALITY_ORDER: Record<Quality, number> = { poor: 0, normal: 1, good: 2, excellent: 3, legendary: 4 };
const STARTER_RECIPE_IDS = ['iron_sword', 'iron_axe', 'iron_lance'];

function recipeUnlockCost(recipe: RecipeData): number {
  if (STARTER_RECIPE_IDS.includes(recipe.id)) return 0;
  return Math.max(100, recipe.levelRequired * 150);
}

/** How long (ms) between auto-generated NPC orders */
const ORDER_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes
/** Maximum simultaneous pending orders */
const MAX_ORDERS = 5;

/** Maximum inventory weight (kg) based on player level */
const MAX_WEIGHT_BASE = 100;
const MAX_WEIGHT_PER_LEVEL = 5;

const SAVE_KEY = '@fk_save_v1';
const SAVE_VERSION = 1;
const PLAYER_ID_KEY = '@fk_player_id';
const CLOUD_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

function getCloudApiBase(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api-server/api`;
  }
  return '';
}

export type CloudSyncStatus = 'idle' | 'syncing' | 'success' | 'error';

const SKILL_TYPES: SkillType[] = [
  'forge', 'extraction', 'commerce', 'construction',
  'enchantment', 'cooking', 'harvest', 'combat',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeId(): string {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

/** Pure helper: sum talent bonus values for a given effect type */
function computeTalentBonus(unlocked: string[], bonusType: string): number {
  let total = 0;
  for (const id of unlocked) {
    const t = ALL_TALENTS.find((x) => x.id === id);
    if (!t) continue;
    const [type, value] = t.effect.split(':');
    if (type === bonusType) total += parseFloat(value);
  }
  return total;
}

function xpForLevel(level: number): number {
  // Exponential curve: early levels stay accessible, late levels require real effort.
  // Level 5 ≈ 207 XP, Level 10 ≈ 516, Level 20 ≈ 3 200, Level 30 ≈ 19 800, Level 40 ≈ 122 700
  return Math.max(100, Math.floor(100 * Math.pow(1.2, level - 1)));
}

function skillXpForLevel(level: number): number {
  return level * 50;
}

function qualityFromScore(score: number): { quality: Quality; rarity: Rarity } {
  if (score >= 95) return { quality: 'legendary', rarity: 'legendary' };
  if (score >= 80) return { quality: 'excellent', rarity: 'epic' };
  if (score >= 60) return { quality: 'good', rarity: 'rare' };
  if (score >= 40) return { quality: 'normal', rarity: 'uncommon' };
  return { quality: 'poor', rarity: 'common' };
}

function valueMultFromQuality(quality: Quality): number {
  switch (quality) {
    case 'legendary': return 5.0;
    case 'excellent': return 2.5;
    case 'good': return 1.5;
    case 'normal': return 1.0;
    case 'poor': return 0.5;
  }
}

// ---------------------------------------------------------------------------
// State shape
// ---------------------------------------------------------------------------
const FORGE_HISTORY_MAX = 100;

interface GameState {
  isLoaded: boolean;
  player: Player;
  inventory: InventoryItem[];
  craftedItems: Item[];
  activeOrders: CraftOrder[];
  completedQuestIds: string[];
  activeQuestIds: string[];
  questProgress: Record<string, Record<string, number>>; // questId → objectiveId → current
  unlockedRegions: string[];
  regionExploration: Record<string, number>;
  npcReputation: Record<string, number>; // npcId → 0-100
  marketPrices: Record<string, number>;  // resourceId → multiplier (1.0 = base)
  lastOrderGeneratedAt: number;
  forgeUpgrades: Record<string, number>; // element → level (0-5)
  forgeHistory: ForgeHistoryEntry[]; // persistent craft history, never deleted on sell
  sessionSnapshots: SessionSnapshot[]; // one per session, newest-last, max 30
  apprentice: Apprentice | null;
}

type GameAction =
  | { type: 'LOAD'; payload: SaveData }
  | { type: 'RESET' }
  | { type: 'ADD_RESOURCE'; resourceId: string; qty: number }
  | { type: 'REMOVE_RESOURCE'; resourceId: string; qty: number }
  | { type: 'ADD_CRAFTED_ITEM'; item: Item }
  | { type: 'MELT_ITEM'; instanceId: string; recovered: CombatDrop[] }
  | { type: 'ADD_GOLD'; amount: number }
  | { type: 'SPEND_GOLD'; amount: number }
  | { type: 'ADD_PLAYER_XP'; amount: number }
  | { type: 'ADD_SKILL_XP'; skill: SkillType; amount: number }
  | { type: 'UNLOCK_REGION'; regionId: string }
  | { type: 'SET_EXPLORATION'; regionId: string; percent: number }
  | { type: 'ADD_EXPLORATION'; regionId: string; gain: number }
  | { type: 'SOCKET_GEM'; itemInstanceId: string; slotIndex: number; gem: GemData }
  | { type: 'REMOVE_GEM'; itemInstanceId: string; slotIndex: number }
  // NPC orders
  | { type: 'ADD_ORDER'; order: CraftOrder }
  | { type: 'ACCEPT_ORDER'; orderId: string }
  | { type: 'REFUSE_ORDER'; orderId: string }
  | { type: 'DELIVER_ORDER'; orderId: string; itemInstanceId: string }
  // Quests
  | { type: 'ACCEPT_QUEST'; questId: string }
  | { type: 'COMPLETE_QUEST'; questId: string }
  | { type: 'UPDATE_QUEST_PROGRESS'; objectiveType: string; targetId: string; amount: number }
  // Market
  | { type: 'SELL_ITEM'; instanceId: string; goldAmount: number }
  | { type: 'SELL_RESOURCE'; resourceId: string; qty: number; goldAmount: number }
  | { type: 'ADJUST_MARKET'; resourceId: string; delta: number }
  // Reputation
  | { type: 'SET_REPUTATION'; npcId: string; delta: number }
  // Forge upgrades
  | { type: 'UPGRADE_FORGE_ELEMENT'; element: string; goldCost: number; resourceCosts: { resourceId: string; qty: number }[] }
  // Talents
  | { type: 'UNLOCK_TALENT'; talentId: string; cost: number }
  | { type: 'UNLOCK_RECIPE'; recipeId: string; goldCost: number }
  // Market buying
  | { type: 'BUY_RESOURCE'; resourceId: string; qty: number; goldCost: number }
  // Order reroll
  | { type: 'REROLL_ORDER'; orderId: string; newOrder: CraftOrder; goldCost: number }
  // Customization
  | { type: 'CUSTOMIZE_PLAYER'; name: string; forgeName: string; avatarColor?: string; avatarIcon?: string | null; avatarImage?: string | null }
  // Session snapshot
  | { type: 'ADD_SESSION_SNAPSHOT'; snapshot: SessionSnapshot }
  // Apprentice
  | { type: 'HIRE_APPRENTICE'; name: string }
  | { type: 'DISMISS_APPRENTICE' }
  | { type: 'ASSIGN_APPRENTICE_RECIPE'; recipeId: string; durationMs: number }
  | { type: 'APPRENTICE_FINISH_CRAFT'; item: Item }
  | { type: 'COLLECT_APPRENTICE_ITEM' }
  | { type: 'TRAIN_APPRENTICE'; goldCost: number };

function buildInitialPlayer(): Player {
  const skills = SKILL_TYPES.reduce(
    (acc, s) => ({ ...acc, [s]: 1 }),
    {} as Record<SkillType, number>,
  );
  const skillXP = SKILL_TYPES.reduce(
    (acc, s) => ({ ...acc, [s]: 0 }),
    {} as Record<SkillType, number>,
  );
  return {
    id: makeId(),
    name: 'Apprenti Forgeron',
    forgeName: 'La Forge du Débutant',
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    gold: 150,
    forgeLevel: 1,
    skills,
    skillXP,
    talentsUnlocked: [],
    unlockedRecipeIds: STARTER_RECIPE_IDS,
    talentPoints: 0,
    totalItemsCrafted: 0,
    totalGoldEarned: 150,
    totalPlayTime: 0,
    totalOrdersDelivered: 0,
    totalQuestsAccepted: 0,
    craftedLegendaryCount: 0,
    craftedExcellentCount: 0,
    craftedGoodCount: 0,
    createdAt: Date.now(),
    streak: 1,
    lastPlayedDate: Date.now(),
    bestSalePrice: 0,
    bestQualityScore: 0,
  };
}

const INITIAL_INVENTORY: InventoryItem[] = [
  { resourceId: 'iron', quantity: 5 },
  { resourceId: 'wood', quantity: 3 },
  { resourceId: 'stone', quantity: 3 },
  { resourceId: 'copper', quantity: 2 },
  { resourceId: 'coal', quantity: 5 },
  // Starter gem set — found in the old forge workshop
  { resourceId: 'ruby', quantity: 2 },
  { resourceId: 'amethyst', quantity: 1 },
];

const APPRENTICE_NAMES = ['Aldric', 'Bryn', 'Caelum', 'Doric', 'Eira', 'Finn', 'Gwen', 'Holt', 'Idris', 'Jora'];
const APPRENTICE_HIRE_COST = 500;

function apprenticeXpForLevel(level: number): number {
  return Math.round(100 * Math.pow(1.5, level - 1));
}

function apprenticeCraftDuration(recipe: RecipeData, apprenticeLevel: number): number {
  const baseSec = recipe.baseTime * 2; // apprentice is 2× slower at level 1
  const speedup = Math.min(0.55, (apprenticeLevel - 1) * 0.07); // up to 55% faster by level 9
  return Math.round(baseSec * (1 - speedup) * 1000);
}

function makeApprenticeItem(recipe: RecipeData, apprenticeLevel: number): Item {
  const roll = Math.random() * 100;
  let quality: Quality;
  if (apprenticeLevel <= 2)      quality = roll < 60 ? 'poor' : 'normal';
  else if (apprenticeLevel <= 4) quality = roll < 35 ? 'normal' : roll < 85 ? 'good' : 'excellent';
  else if (apprenticeLevel <= 6) quality = roll < 15 ? 'normal' : roll < 55 ? 'good' : roll < 88 ? 'excellent' : 'legendary';
  else if (apprenticeLevel <= 8) quality = roll < 25 ? 'good' : roll < 70 ? 'excellent' : 'legendary';
  else                           quality = roll < 35 ? 'excellent' : 'legendary';

  const QUALITY_SCORE: Record<Quality, number> = { poor: 15, normal: 45, good: 65, excellent: 82, legendary: 96 };
  const qualityMults: Record<Quality, number>  = { poor: 0.5, normal: 0.8, good: 1.0, excellent: 1.5, legendary: 2.5 };
  const RARITY_MAP: Record<Quality, Rarity>    = { poor: 'common', normal: 'uncommon', good: 'rare', excellent: 'epic', legendary: 'legendary' };

  const base  = recipe.outputItemBase;
  const value = Math.round(base.valueMultiplier * 100 * qualityMults[quality]);

  return {
    instanceId:   makeId(),
    recipeId:     recipe.id,
    name:         base.name,
    description:  base.description,
    lore:         base.lore,
    category:     base.category as ItemCategory,
    level:        recipe.levelRequired,
    quality,
    rarity:       RARITY_MAP[quality],
    durability:   base.durabilityBase,
    maxDurability: base.durabilityBase,
    weight:       base.weight,
    value,
    stats:        base.baseStats ?? {},
    gemSlots:     base.gemSlots ?? 0,
    gems:         Array(base.gemSlots ?? 0).fill(null),
    materials:    recipe.requirements.map((r) => r.resourceId),
    craftedBy:    'apprentice',
    craftedAt:    Date.now(),
    qualityScore: QUALITY_SCORE[quality],
  };
}

function buildInitialState(): GameState {
  return {
    isLoaded: false,
    player: buildInitialPlayer(),
    inventory: INITIAL_INVENTORY,
    craftedItems: [],
    activeOrders: [],
    completedQuestIds: [],
    activeQuestIds: [],
    questProgress: {},
    unlockedRegions: ['village'],
    regionExploration: { village: 0 },
    npcReputation: {},
    marketPrices: {},
    lastOrderGeneratedAt: 0,
    forgeUpgrades: {},
    forgeHistory: [],
    sessionSnapshots: [],
    apprentice: null,
  };
}

/** Generate a random NPC order based on player level */
function generateNpcOrder(playerLevel: number, forgeLevel: number): CraftOrder {
  // High-tier NPCs can have requests that a new forge simply cannot fulfill.
  // Only introduce them once the player has the matching progression.
  const eligibleNpcs = ALL_NPCS.filter((npc) => {
    if (npc.type === 'king') return playerLevel >= 20 && forgeLevel >= 5;
    if (npc.type === 'noble') return playerLevel >= 12 && forgeLevel >= 3;
    return true;
  });
  const npcPool = eligibleNpcs.length > 0 ? eligibleNpcs : ALL_NPCS;
  const npc = npcPool[Math.floor(Math.random() * npcPool.length)];

  // Pick a recipe matching NPC preferences and player level
  // Never request a recipe above the forge skill level; it must be craftable now.
  const maxRecipeLevel = Math.max(1, Math.min(playerLevel, forgeLevel));
  const eligible = ALL_RECIPES.filter((r) => {
    const matchesCategory = npc.preferredCategories.includes(r.category);
    return matchesCategory && r.levelRequired <= maxRecipeLevel;
  });
  const recipe = eligible.length > 0
    ? eligible[Math.floor(Math.random() * eligible.length)]
    : ALL_RECIPES.filter((r) => r.levelRequired <= Math.max(1, playerLevel))[0]
      ?? ALL_RECIPES[0];

  const budgetRange = npc.budgetMax - npc.budgetMin;
  const goldReward = Math.round(npc.budgetMin + Math.random() * budgetRange);
  const xpReward = Math.round(recipe.xpReward * (1.5 + Math.random()));
  const repReward = Math.round(5 + Math.random() * 15);
  // Deadline: 6–18 hours from now (more generous than before)
  const deadlineHours = 6 + Math.floor(Math.random() * 13);
  const deadline = Date.now() + deadlineHours * 60 * 60 * 1000;

  // Orders start with forgiving quality targets and rise only with actual forge
  // ability. This avoids "good" requests before the player can reliably make one.
  // Forge 1-3: poor/normal, 4-7: at most good, 8-9: at most excellent, 10: all.
  const npcQualityIdx = QUALITY_ORDER[npc.minQuality] ?? 1;
  let maxQualityIdx: number;
  if (forgeLevel <= 1 || playerLevel < 4) maxQualityIdx = 0; // poor
  else if (forgeLevel <= 3 || playerLevel < 8) maxQualityIdx = 1; // normal
  else if (forgeLevel <= 7 || playerLevel < 15) maxQualityIdx = 2; // good
  else if (forgeLevel <= 9 || playerLevel < 25) maxQualityIdx = 3; // excellent
  else maxQualityIdx = 4; // legendary
  const minQualityIdx = Math.min(npcQualityIdx, maxQualityIdx);
  const qualities: Quality[] = ['poor', 'normal', 'good', 'excellent', 'legendary'];

  return {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 6),
    npcId: npc.id,
    npcName: npc.name,
    npcType: npc.type,
    npcEmoji: npc.emoji,
    requestedCategory: recipe.category,
    requestedName: recipe.outputItemBase.name,
    minQuality: qualities[minQualityIdx] ?? 'normal',
    deadline,
    goldReward,
    xpReward,
    reputationReward: repReward,
    accepted: false,
    completed: false,
  };
}

function levelUpPlayer(player: Player): Player {
  let { xp, xpToNextLevel, level } = player;
  let talentPoints = player.talentPoints ?? 0;
  while (xp >= xpToNextLevel) {
    xp -= xpToNextLevel;
    level += 1;
    talentPoints += 1;
    xpToNextLevel = xpForLevel(level);
  }
  return { ...player, xp, level, xpToNextLevel, talentPoints };
}

function levelUpSkill(player: Player, skill: SkillType, xpGain: number): Player {
  const skillXP = { ...player.skillXP };
  const skills = { ...player.skills };
  skillXP[skill] = (skillXP[skill] ?? 0) + xpGain;
  const threshold = skillXpForLevel(skills[skill] ?? 1);
  let result = { ...player, skillXP, skills };
  if (skillXP[skill] >= threshold && skills[skill] < 100) {
    skillXP[skill] -= threshold;
    const newLevel = (skills[skill] ?? 1) + 1;
    skills[skill] = newLevel;
    result = { ...result, skillXP, skills };
    // Forge skill drives forge level
    if (skill === 'forge') {
      const newForgeLevel = Math.min(10, Math.floor(newLevel / 10) + 1);
      return { ...result, forgeLevel: newForgeLevel };
    }
  }
  return { ...result, skillXP, skills };
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'LOAD': {
      const s = action.payload;
      // Normalize player for backward-compat: any field added after initial release
      // must be defaulted here so legacy saves don't produce undefined/NaN.
      const spentTalentPoints = (s.player.talentsUnlocked ?? []).reduce(
        (total, talentId) => total + (ALL_TALENTS.find((talent) => talent.id === talentId)?.cost ?? 0),
        0,
      );
      // Saves created before player-level talent points existed may contain
      // skill-level points only. Bring them up to the new earned baseline
      // without taking away points already earned or spent.
      const earnedByPlayerLevel = Math.max(0, (s.player.level ?? 1) - 1);
      const migratedTalentPoints = Math.max(
        s.player.talentPoints ?? 0,
        earnedByPlayerLevel - spentTalentPoints,
      );
      let player: Player = {
        ...s.player,
        forgeName: s.player.forgeName ?? 'La Forge du Débutant',
        talentPoints: migratedTalentPoints,
        talentsUnlocked: s.player.talentsUnlocked ?? [],
        unlockedRecipeIds: Array.from(new Set([
          ...STARTER_RECIPE_IDS,
          ...(s.player.unlockedRecipeIds ?? []),
          ...(s.craftedItems ?? []).map((item) => item.recipeId),
          ...(s.forgeHistory ?? []).flatMap((item) => item.recipeId ? [item.recipeId] : []),
        ])),
        totalGoldEarned: s.player.totalGoldEarned ?? 0,
        totalItemsCrafted: s.player.totalItemsCrafted ?? 0,
        totalOrdersDelivered: s.player.totalOrdersDelivered ?? 0,
        totalQuestsAccepted: s.player.totalQuestsAccepted ?? 0,
        craftedLegendaryCount: s.player.craftedLegendaryCount ?? 0,
        craftedExcellentCount: s.player.craftedExcellentCount ?? 0,
        craftedGoodCount: s.player.craftedGoodCount ?? 0,
        bestSalePrice: s.player.bestSalePrice ?? 0,
        bestQualityScore: s.player.bestQualityScore ?? 0,
        lastPlayedDate: s.player.lastPlayedDate ?? 0,
        streak: s.player.streak ?? 1,
        avatarColor: s.player.avatarColor ?? undefined,
        avatarIcon: s.player.avatarIcon ?? undefined,
        avatarImage: s.player.avatarImage ?? null,
      };
      return {
        isLoaded: true,
        player,
        inventory: s.inventory,
        craftedItems: s.craftedItems,
        activeOrders: s.activeOrders ?? [],
        completedQuestIds: s.completedQuestIds ?? [],
        activeQuestIds: s.activeQuestIds ?? [],
        questProgress: s.questProgress ?? {},
        unlockedRegions: s.unlockedRegions,
        regionExploration: s.regionExploration,
        npcReputation: s.npcReputation ?? {},
        marketPrices: s.marketPrices ?? {},
        lastOrderGeneratedAt: s.lastOrderGeneratedAt ?? 0,
        forgeUpgrades: s.forgeUpgrades ?? {},
        forgeHistory: s.forgeHistory ?? [],
        sessionSnapshots: s.sessionSnapshots ?? [],
        apprentice: s.apprentice ?? null,
      };
    }
    case 'RESET': {
      return { ...buildInitialState(), isLoaded: true };
    }
    case 'ADD_RESOURCE': {
      const inv = [...state.inventory];
      const idx = inv.findIndex((i) => i.resourceId === action.resourceId);
      if (idx >= 0) {
        inv[idx] = { ...inv[idx], quantity: inv[idx].quantity + action.qty };
      } else {
        inv.push({ resourceId: action.resourceId, quantity: action.qty });
      }
      return { ...state, inventory: inv };
    }
    case 'REMOVE_RESOURCE': {
      const inv = state.inventory
        .map((i) =>
          i.resourceId === action.resourceId
            ? { ...i, quantity: i.quantity - action.qty }
            : i,
        )
        .filter((i) => i.quantity > 0);
      return { ...state, inventory: inv };
    }
    case 'ADD_CRAFTED_ITEM': {
      const player = {
        ...state.player,
        totalItemsCrafted: state.player.totalItemsCrafted + 1,
        craftedLegendaryCount:
          action.item.quality === 'legendary'
            ? (state.player.craftedLegendaryCount ?? 0) + 1
            : (state.player.craftedLegendaryCount ?? 0),
        craftedExcellentCount:
          action.item.quality === 'excellent'
            ? (state.player.craftedExcellentCount ?? 0) + 1
            : (state.player.craftedExcellentCount ?? 0),
        craftedGoodCount:
          action.item.quality === 'good'
            ? (state.player.craftedGoodCount ?? 0) + 1
            : (state.player.craftedGoodCount ?? 0),
        bestQualityScore: Math.max(state.player.bestQualityScore ?? 0, action.item.qualityScore ?? 0),
      };
      const historyEntry: ForgeHistoryEntry = {
        instanceId: action.item.instanceId,
        recipeId: action.item.recipeId,
        name: action.item.name,
        category: action.item.category,
        quality: action.item.quality,
        qualityScore: action.item.qualityScore,
        value: action.item.value,
        craftedAt: action.item.craftedAt,
      };
      const forgeHistory = [historyEntry, ...state.forgeHistory].slice(0, FORGE_HISTORY_MAX);
      return { ...state, craftedItems: [...state.craftedItems, action.item], player, forgeHistory };
    }
    case 'MELT_ITEM': {
      const item = state.craftedItems.find((candidate) => candidate.instanceId === action.instanceId);
      if (!item) return state;
      let inventory = [...state.inventory];
      for (const recovered of action.recovered) {
        const index = inventory.findIndex((entry) => entry.resourceId === recovered.resourceId);
        if (index >= 0) {
          inventory[index] = {
            ...inventory[index],
            quantity: inventory[index].quantity + recovered.quantity,
          };
        } else {
          inventory.push(recovered);
        }
      }
      return {
        ...state,
        craftedItems: state.craftedItems.filter((candidate) => candidate.instanceId !== action.instanceId),
        inventory,
      };
    }
    case 'ADD_GOLD': {
      const player = {
        ...state.player,
        gold: state.player.gold + action.amount,
        totalGoldEarned: state.player.totalGoldEarned + action.amount,
      };
      return { ...state, player };
    }
    case 'SPEND_GOLD': {
      const player = {
        ...state.player,
        gold: Math.max(0, state.player.gold - action.amount),
      };
      return { ...state, player };
    }
    case 'ADD_PLAYER_XP': {
      const updated = levelUpPlayer({
        ...state.player,
        xp: state.player.xp + action.amount,
      });
      return { ...state, player: updated };
    }
    case 'ADD_SKILL_XP': {
      const xpMultiplier = 1
        + computeTalentBonus(state.player.talentsUnlocked, 'allXPBonus')
        + computeTalentBonus(state.player.talentsUnlocked, `${action.skill}XPBonus`);
      const boostedAmount = Math.round(action.amount * xpMultiplier);
      const updated = levelUpSkill(state.player, action.skill, boostedAmount);
      return { ...state, player: updated };
    }
    case 'UNLOCK_REGION': {
      if (state.unlockedRegions.includes(action.regionId)) return state;
      return {
        ...state,
        unlockedRegions: [...state.unlockedRegions, action.regionId],
        regionExploration: { ...state.regionExploration, [action.regionId]: 0 },
      };
    }
    case 'SET_EXPLORATION': {
      return {
        ...state,
        regionExploration: {
          ...state.regionExploration,
          [action.regionId]: Math.min(100, action.percent),
        },
      };
    }
    case 'ADD_EXPLORATION': {
      const cur = state.regionExploration[action.regionId] ?? 0;
      return {
        ...state,
        regionExploration: {
          ...state.regionExploration,
          [action.regionId]: Math.min(100, cur + action.gain),
        },
      };
    }
    case 'SOCKET_GEM': {
      const items = state.craftedItems.map((item) => {
        if (item.instanceId !== action.itemInstanceId) return item;
        const gems = [...item.gems];
        gems[action.slotIndex] = action.gem;
        return { ...item, gems };
      });
      const inv = state.inventory
        .map((i) =>
          i.resourceId === action.gem.type ? { ...i, quantity: i.quantity - 1 } : i,
        )
        .filter((i) => i.quantity > 0);
      return { ...state, craftedItems: items, inventory: inv };
    }
    case 'REMOVE_GEM': {
      let removedGem: GemData | null = null;
      const items = state.craftedItems.map((item) => {
        if (item.instanceId !== action.itemInstanceId) return item;
        const gems = [...item.gems];
        removedGem = gems[action.slotIndex] as GemData;
        gems[action.slotIndex] = null;
        return { ...item, gems };
      });
      if (!removedGem) return state;
      const gemType = (removedGem as GemData).type;
      const inv = [...state.inventory];
      const idx = inv.findIndex((i) => i.resourceId === gemType);
      if (idx >= 0) {
        inv[idx] = { ...inv[idx], quantity: inv[idx].quantity + 1 };
      } else {
        inv.push({ resourceId: gemType, quantity: 1 });
      }
      return { ...state, craftedItems: items, inventory: inv };
    }
    // ── NPC orders ──────────────────────────────────────────────────────────
    case 'ADD_ORDER': {
      if (state.activeOrders.length >= MAX_ORDERS) return state;
      // Don't add duplicate orders for same npcId
      if (state.activeOrders.some((o) => o.npcId === action.order.npcId && !o.completed)) return state;
      return {
        ...state,
        activeOrders: [...state.activeOrders, action.order],
        lastOrderGeneratedAt: Date.now(),
      };
    }
    case 'ACCEPT_ORDER': {
      return {
        ...state,
        activeOrders: state.activeOrders.map((o) =>
          o.id === action.orderId ? { ...o, accepted: true } : o,
        ),
      };
    }
    case 'REFUSE_ORDER': {
      return {
        ...state,
        activeOrders: state.activeOrders.filter((o) => o.id !== action.orderId),
      };
    }
    case 'DELIVER_ORDER': {
      const order = state.activeOrders.find((o) => o.id === action.orderId);
      if (!order) return state;
      const gold = state.player.gold + order.goldReward;
      const player = {
        ...state.player,
        gold,
        totalGoldEarned: state.player.totalGoldEarned + order.goldReward,
        totalOrdersDelivered: (state.player.totalOrdersDelivered ?? 0) + 1,
      };
      const items = state.craftedItems.filter((i) => i.instanceId !== action.itemInstanceId);
      const orders = state.activeOrders.map((o) =>
        o.id === action.orderId ? { ...o, completed: true } : o,
      );
      // Quest progress: deliver
      const qp = { ...state.questProgress };
      for (const qid of state.activeQuestIds) {
        const quest = ALL_QUESTS.find((q) => q.id === qid);
        if (!quest) continue;
        for (const obj of quest.objectives) {
          if (obj.type === 'deliver') {
            qp[qid] = { ...qp[qid], [obj.id]: Math.min(obj.required, (qp[qid]?.[obj.id] ?? 0) + 1) };
          }
        }
      }
      const rep = { ...state.npcReputation };
      rep[order.npcId] = Math.min(100, (rep[order.npcId] ?? 50) + order.reputationReward);
      return { ...state, player, craftedItems: items, activeOrders: orders, questProgress: qp, npcReputation: rep };
    }

    // ── Quests ───────────────────────────────────────────────────────────────
    case 'ACCEPT_QUEST': {
      if (state.activeQuestIds.includes(action.questId)) return state;
      if (state.completedQuestIds.includes(action.questId)) return state;
      const player = {
        ...state.player,
        totalQuestsAccepted: (state.player.totalQuestsAccepted ?? 0) + 1,
      };
      return { ...state, activeQuestIds: [...state.activeQuestIds, action.questId], player };
    }
    case 'COMPLETE_QUEST': {
      const quest = ALL_QUESTS.find((q) => q.id === action.questId);
      const player = quest
        ? levelUpPlayer({
            ...state.player,
            xp: state.player.xp + quest.rewards.xp,
            gold: state.player.gold + quest.rewards.gold,
            totalGoldEarned: state.player.totalGoldEarned + quest.rewards.gold,
          })
        : state.player;
      const unlockedRegions = quest?.rewards.unlockRegion &&
        !state.unlockedRegions.includes(quest.rewards.unlockRegion)
        ? [...state.unlockedRegions, quest.rewards.unlockRegion]
        : state.unlockedRegions;
      const regionExploration = quest?.rewards.unlockRegion &&
        !state.regionExploration[quest.rewards.unlockRegion]
        ? { ...state.regionExploration, [quest.rewards.unlockRegion]: 0 }
        : state.regionExploration;
      return {
        ...state,
        player,
        unlockedRegions,
        regionExploration,
        activeQuestIds: state.activeQuestIds.filter((id) => id !== action.questId),
        completedQuestIds: [...state.completedQuestIds, action.questId],
        questProgress: { ...state.questProgress, [action.questId]: undefined as unknown as Record<string, number> },
      };
    }
    case 'UPDATE_QUEST_PROGRESS': {
      const qp = { ...state.questProgress };
      let newCompletions: string[] = [];
      let player = state.player;
      let unlockedRegions = state.unlockedRegions;
      let regionExploration = state.regionExploration;
      let completedQuestIds = state.completedQuestIds;
      let activeQuestIds = state.activeQuestIds;

      for (const qid of state.activeQuestIds) {
        const quest = ALL_QUESTS.find((q) => q.id === qid);
        if (!quest) continue;
        let anyUpdated = false;
        const qProgress = { ...(qp[qid] ?? {}) };

        for (const obj of quest.objectives) {
          const matches =
            obj.type === action.objectiveType &&
            (obj.targetId === action.targetId || obj.targetId === 'any');
          if (!matches) continue;
          const prev = qProgress[obj.id] ?? 0;
          if (prev < obj.required) {
            qProgress[obj.id] = Math.min(obj.required, prev + action.amount);
            anyUpdated = true;
          }
        }
        if (anyUpdated) {
          qp[qid] = qProgress;
          // Check if quest is now complete
          const allDone = quest.objectives.every(
            (obj) => (qProgress[obj.id] ?? 0) >= obj.required,
          );
          if (allDone) {
            newCompletions.push(qid);
          }
        }
      }

      // Apply completions
      for (const qid of newCompletions) {
        const quest = ALL_QUESTS.find((q) => q.id === qid);
        if (!quest) continue;
        player = levelUpPlayer({
          ...player,
          xp: player.xp + quest.rewards.xp,
          gold: player.gold + quest.rewards.gold,
          totalGoldEarned: player.totalGoldEarned + quest.rewards.gold,
        });
        if (quest.rewards.unlockRegion && !unlockedRegions.includes(quest.rewards.unlockRegion)) {
          unlockedRegions = [...unlockedRegions, quest.rewards.unlockRegion];
          regionExploration = { ...regionExploration, [quest.rewards.unlockRegion]: 0 };
        }
        completedQuestIds = [...completedQuestIds, qid];
        activeQuestIds = activeQuestIds.filter((id) => id !== qid);
      }

      return { ...state, questProgress: qp, player, unlockedRegions, regionExploration, completedQuestIds, activeQuestIds };
    }

    // ── Market & selling ─────────────────────────────────────────────────────
    case 'SELL_ITEM': {
      if (!state.craftedItems.some((item) => item.instanceId === action.instanceId) || action.goldAmount <= 0) {
        return state;
      }
      const player = {
        ...state.player,
        gold: state.player.gold + action.goldAmount,
        totalGoldEarned: state.player.totalGoldEarned + action.goldAmount,
        bestSalePrice: Math.max(state.player.bestSalePrice ?? 0, action.goldAmount),
      };
      return {
        ...state,
        player,
        craftedItems: state.craftedItems.filter((i) => i.instanceId !== action.instanceId),
      };
    }
    case 'SELL_RESOURCE': {
      const owned = state.inventory.find((item) => item.resourceId === action.resourceId)?.quantity ?? 0;
      if (action.qty <= 0 || action.qty > owned || action.goldAmount <= 0) return state;
      const player = {
        ...state.player,
        gold: state.player.gold + action.goldAmount,
        totalGoldEarned: state.player.totalGoldEarned + action.goldAmount,
      };
      const inventory = state.inventory
        .map((i) =>
          i.resourceId === action.resourceId
            ? { ...i, quantity: i.quantity - action.qty }
            : i,
        )
        .filter((i) => i.quantity > 0);
      return { ...state, player, inventory };
    }
    case 'ADJUST_MARKET': {
      const cur = state.marketPrices[action.resourceId] ?? 1.0;
      const next = Math.max(0.3, Math.min(3.0, cur + action.delta));
      return { ...state, marketPrices: { ...state.marketPrices, [action.resourceId]: Math.round(next * 100) / 100 } };
    }
    case 'SET_REPUTATION': {
      const cur = state.npcReputation[action.npcId] ?? 50;
      return {
        ...state,
        npcReputation: {
          ...state.npcReputation,
          [action.npcId]: Math.max(0, Math.min(100, cur + action.delta)),
        },
      };
    }

    case 'UPGRADE_FORGE_ELEMENT': {
      // Deduct gold
      const player = {
        ...state.player,
        gold: Math.max(0, state.player.gold - action.goldCost),
      };
      // Deduct resources
      let inventory = state.inventory;
      for (const rc of action.resourceCosts) {
        inventory = inventory
          .map((i) => i.resourceId === rc.resourceId ? { ...i, quantity: i.quantity - rc.qty } : i)
          .filter((i) => i.quantity > 0);
      }
      const currentLevel = state.forgeUpgrades[action.element] ?? 0;
      const forgeUpgrades = { ...state.forgeUpgrades, [action.element]: currentLevel + 1 };
      // Add skill XP to construction skill
      const updatedPlayer = levelUpSkill(player, 'construction', 20);
      return { ...state, player: updatedPlayer, inventory, forgeUpgrades };
    }

    case 'UNLOCK_TALENT': {
      const talent = ALL_TALENTS.find((t) => t.id === action.talentId);
      const [effectType, effectValue] = (talent?.effect ?? ':0').split(':');
      const bonusPoints = effectType === 'bonusTalentPoint' ? parseInt(effectValue, 10) : 0;
      const player = {
        ...state.player,
        talentPoints: Math.max(0, state.player.talentPoints - action.cost) + bonusPoints,
        talentsUnlocked: [...state.player.talentsUnlocked, action.talentId],
      };
      return { ...state, player };
    }

    case 'UNLOCK_RECIPE': {
      const recipe = ALL_RECIPES.find((candidate) => candidate.id === action.recipeId);
      if (!recipe || state.player.unlockedRecipeIds.includes(action.recipeId)) return state;
      const skillLevel = state.player.skills[recipe.skillRequired] ?? 0;
      const expectedCost = recipeUnlockCost(recipe);
      if (skillLevel < recipe.levelRequired || action.goldCost !== expectedCost || state.player.gold < expectedCost) {
        return state;
      }
      return {
        ...state,
        player: {
          ...state.player,
          gold: state.player.gold - expectedCost,
          unlockedRecipeIds: [...state.player.unlockedRecipeIds, action.recipeId],
        },
      };
    }

    case 'BUY_RESOURCE': {
      if (state.player.gold < action.goldCost) return state;
      const inv = [...state.inventory];
      const idx = inv.findIndex((i) => i.resourceId === action.resourceId);
      if (idx >= 0) {
        inv[idx] = { ...inv[idx], quantity: inv[idx].quantity + action.qty };
      } else {
        inv.push({ resourceId: action.resourceId, quantity: action.qty });
      }
      return {
        ...state,
        player: { ...state.player, gold: state.player.gold - action.goldCost },
        inventory: inv,
      };
    }

    case 'REROLL_ORDER': {
      if (state.player.gold < action.goldCost) return state;
      const orders = state.activeOrders.filter((o) => o.id !== action.orderId);
      return {
        ...state,
        player: { ...state.player, gold: state.player.gold - action.goldCost },
        activeOrders: [...orders, action.newOrder],
      };
    }

    case 'CUSTOMIZE_PLAYER': {
      const player: Player = {
        ...state.player,
        name: action.name.trim(),
        forgeName: action.forgeName.trim(),
        avatarColor: action.avatarColor ?? state.player.avatarColor,
        avatarIcon: action.avatarIcon !== undefined ? action.avatarIcon : state.player.avatarIcon,
        avatarImage: action.avatarImage !== undefined ? action.avatarImage : state.player.avatarImage,
      };
      return { ...state, player };
    }

    case 'ADD_SESSION_SNAPSHOT': {
      const prev = state.sessionSnapshots;
      // Deduplicate: skip if last snapshot was taken less than 10 minutes ago
      if (prev.length > 0 && action.snapshot.timestamp - prev[prev.length - 1].timestamp < 10 * 60 * 1000) {
        return state;
      }
      const snapshots = [...prev, action.snapshot].slice(-30);
      return { ...state, sessionSnapshots: snapshots };
    }

    // ── Apprentice ────────────────────────────────────────────────────────────
    case 'HIRE_APPRENTICE': {
      if (state.player.gold < APPRENTICE_HIRE_COST) return state;
      const apprentice: Apprentice = {
        name: action.name,
        level: 1,
        xp: 0,
        xpToNextLevel: apprenticeXpForLevel(1),
        assignedRecipeId: null,
        craftStartedAt: null,
        craftDurationMs: 0,
        readyItem: null,
      };
      return {
        ...state,
        player: { ...state.player, gold: state.player.gold - APPRENTICE_HIRE_COST },
        apprentice,
      };
    }

    case 'DISMISS_APPRENTICE':
      return { ...state, apprentice: null };

    case 'ASSIGN_APPRENTICE_RECIPE': {
      if (!state.apprentice) return state;
      return {
        ...state,
        apprentice: {
          ...state.apprentice,
          assignedRecipeId: action.recipeId,
          craftStartedAt: Date.now(),
          craftDurationMs: action.durationMs,
          readyItem: null,
        },
      };
    }

    case 'APPRENTICE_FINISH_CRAFT': {
      if (!state.apprentice) return state;
      return {
        ...state,
        apprentice: {
          ...state.apprentice,
          craftStartedAt: null,
          readyItem: action.item,
        },
      };
    }

    case 'COLLECT_APPRENTICE_ITEM': {
      if (!state.apprentice?.readyItem) return state;
      const item = state.apprentice.readyItem;
      // Give apprentice XP on collection
      let newXp = state.apprentice.xp + Math.round(20 * state.apprentice.level);
      let newLevel = state.apprentice.level;
      let newXpNeeded = state.apprentice.xpToNextLevel;
      if (newXp >= newXpNeeded && newLevel < 10) {
        newXp -= newXpNeeded;
        newLevel += 1;
        newXpNeeded = apprenticeXpForLevel(newLevel);
      }
      // Auto-restart craft if recipe still assigned
      const now = Date.now();
      const recipe = state.apprentice.assignedRecipeId
        ? ALL_RECIPES.find((r) => r.id === state.apprentice!.assignedRecipeId)
        : null;
      const newDuration = recipe ? apprenticeCraftDuration(recipe, newLevel) : 0;
      return {
        ...state,
        craftedItems: [...state.craftedItems, item],
        apprentice: {
          ...state.apprentice,
          level: newLevel,
          xp: newXp,
          xpToNextLevel: newXpNeeded,
          readyItem: null,
          craftStartedAt: recipe ? now : null,
          craftDurationMs: newDuration,
        },
      };
    }

    case 'TRAIN_APPRENTICE': {
      if (!state.apprentice) return state;
      if (state.player.gold < action.goldCost) return state;
      if (state.apprentice.level >= 10) return state;
      const newLevel = state.apprentice.level + 1;
      return {
        ...state,
        player: { ...state.player, gold: state.player.gold - action.goldCost },
        apprentice: {
          ...state.apprentice,
          level: newLevel,
          xp: 0,
          xpToNextLevel: apprenticeXpForLevel(newLevel),
        },
      };
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------
interface GameContextType {
  // State
  isLoaded: boolean;
  player: Player;
  inventory: InventoryItem[];
  craftedItems: Item[];
  activeOrders: CraftOrder[];
  unlockedRegions: string[];
  regionExploration: Record<string, number>;
  npcReputation: Record<string, number>;
  marketPrices: Record<string, number>;
  activeQuestIds: string[];
  completedQuestIds: string[];
  questProgress: Record<string, Record<string, number>>;
  // Static data
  allResources: ResourceData[];
  allRecipes: RecipeData[];
  allRegions: RegionData[];
  allSkills: SkillData[];
  allGems: GemData[];
  allNPCs: NPCData[];
  allQuests: Quest[];
  maxWeight: number;
  // Helpers
  getResourceById: (id: string) => ResourceData | undefined;
  getRecipeById: (id: string) => RecipeData | undefined;
  getRecipeUnlockCost: (recipeId: string) => number;
  getInventoryQty: (resourceId: string) => number;
  canCraftRecipe: (recipeId: string) => boolean;
  getAvailableRecipes: () => RecipeData[];
  unlockRecipe: (recipeId: string) => boolean;
  getSocketableGems: () => GemData[];
  getActiveQuests: () => (Quest & { progress: Record<string, number> })[];
  getMarketPrice: (resourceId: string) => number;
  // Actions
  addResource: (resourceId: string, qty: number) => void;
  removeResource: (resourceId: string, qty: number) => void;
  craftItem: (recipeId: string) => Item | null;
  craftItemWithScore: (recipeId: string, qualityScore: number) => Item | null;
  socketGem: (itemInstanceId: string, slotIndex: number, gem: GemData) => boolean;
  removeGem: (itemInstanceId: string, slotIndex: number) => void;
  acceptOrder: (orderId: string) => void;
  refuseOrder: (orderId: string) => void;
  deliverOrder: (orderId: string, itemInstanceId: string) => { success: boolean; message: string };
  acceptQuest: (questId: string) => void;
  updateQuestProgress: (type: 'craft' | 'collect' | 'sell' | 'deliver', targetId: string, amount: number) => void;
  sellItem: (instanceId: string) => number;
  sellResource: (resourceId: string, qty: number) => number;
  buyResource: (resourceId: string, qty: number) => boolean;
  rerollOrder: (orderId: string) => { success: boolean; cost: number };
  addGold: (amount: number) => void;
  spendGold: (amount: number) => boolean;
  addPlayerXP: (amount: number) => void;
  addSkillXP: (skill: SkillType, amount: number) => void;
  collectFromRegion: (regionId: string) => { resourceId: string; quantity: number }[];
  unlockRegion: (regionId: string) => void;
  addExploration: (regionId: string, gain: number) => void;
  fightForMaterials: (regionId: string, playerTotal: number, enemyTotal: number) => CombatResult;
  saveGame: () => Promise<void>;
  resetGame: () => void;
  // Progression
  allTalents: TalentData[];
  allForgeUpgrades: ForgeUpgradeData[];
  forgeUpgrades: Record<string, number>;
  upgradeForgeElement: (element: string) => { success: boolean; message: string };
  unlockTalent: (talentId: string) => boolean;
  meltItem: (instanceId: string) => { success: boolean; message: string; recovered: CombatDrop[] };
  getTalentBonus: (bonusType: string) => number;
  // Forge history
  forgeHistory: ForgeHistoryEntry[];
  // Session snapshots
  sessionSnapshots: SessionSnapshot[];
  // Cloud sync
  cloudSyncStatus: CloudSyncStatus;
  lastCloudSync: number | null;
  syncToCloud: () => Promise<void>;
  // Customization
  customizePlayer: (name: string, forgeName: string, avatarColor?: string, avatarIcon?: string | null, avatarImage?: string | null) => void;
  // Apprentice
  apprentice: Apprentice | null;
  hireApprentice: () => boolean;
  dismissApprentice: () => void;
  assignApprenticeRecipe: (recipeId: string) => boolean;
  collectApprenticeItem: () => Item | null;
  trainApprentice: () => { success: boolean; cost: number; message: string };
}

const GameContext = createContext<GameContextType | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, buildInitialState());
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cloudTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerIdRef = useRef<string>('');
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('idle');
  const [lastCloudSync, setLastCloudSync] = useState<number | null>(null);
  // Ref always pointing to latest syncToCloud to avoid stale closure in the interval
  const syncToCloudRef = useRef<() => Promise<void>>(() => Promise.resolve());

  // Load saved game + player-id on mount
  useEffect(() => {
    (async () => {
      // ── Step 1: ensure a persistent player ID ────────────────────────────
      let pid = '';
      try {
        let stored = await AsyncStorage.getItem(PLAYER_ID_KEY);
        if (!stored) {
          stored = makeId();
          await AsyncStorage.setItem(PLAYER_ID_KEY, stored);
        }
        pid = stored;
        playerIdRef.current = pid;
      } catch {
        pid = makeId();
        playerIdRef.current = pid;
      }

      // ── Step 2: load local save + cloud save in parallel ─────────────────
      const base = getCloudApiBase();

      const [localRaw, cloudResult] = await Promise.allSettled([
        AsyncStorage.getItem(SAVE_KEY),
        base && pid
          ? fetch(`${base}/save/${pid}`).then((r) => (r.ok ? r.json() : null))
          : Promise.resolve(null),
      ]);

      // Parse local save
      let localData: SaveData | null = null;
      try {
        const raw = localRaw.status === 'fulfilled' ? localRaw.value : null;
        if (raw) {
          const parsed: SaveData = JSON.parse(raw);
          if (parsed.version === SAVE_VERSION) localData = parsed;
        }
      } catch { /* ignore parse errors */ }

      // Parse cloud save
      let cloudData: SaveData | null = null;
      try {
        const json = cloudResult.status === 'fulfilled' ? cloudResult.value : null;
        if (json?.saveData?.version === SAVE_VERSION) {
          cloudData = json.saveData as SaveData;
        }
      } catch { /* ignore */ }

      // ── Step 3: merge sessionSnapshots from cloud into whichever save we use ──
      function mergeSnapshots(
        primary: SessionSnapshot[],
        secondary: SessionSnapshot[],
      ): SessionSnapshot[] {
        const seen = new Set(primary.map((s) => s.timestamp));
        return [...primary, ...secondary.filter((s) => !seen.has(s.timestamp))]
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(-30);
      }

      // ── Step 4: apply streak logic then dispatch ──────────────────────────
      function applyStreak(data: SaveData): { data: SaveData; changed: boolean } {
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        const todayMs = todayMidnight.getTime();
        const yesterdayMs = todayMs - 86400000;
        const lastPlayed = data.player.lastPlayedDate ?? 0;
        if (lastPlayed >= todayMs) return { data, changed: false };
        const updatedPlayer =
          lastPlayed >= yesterdayMs
            ? { ...data.player, streak: (data.player.streak ?? 1) + 1, lastPlayedDate: todayMs }
            : { ...data.player, streak: 1, lastPlayedDate: todayMs };
        return { data: { ...data, player: updatedPlayer }, changed: true };
      }

      if (localData) {
        // Merge cloud snapshots into local save (local is authoritative for all other fields)
        if (cloudData?.sessionSnapshots?.length) {
          localData = {
            ...localData,
            sessionSnapshots: mergeSnapshots(
              localData.sessionSnapshots ?? [],
              cloudData.sessionSnapshots,
            ),
          };
        }
        const { data, changed } = applyStreak(localData);
        dispatch({ type: 'LOAD', payload: data });
        if (changed) {
          try {
            await AsyncStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, lastSaved: Date.now() }));
          } catch { /* ignore */ }
        }
        return;
      }

      if (cloudData) {
        // Full restore from cloud (reinstall scenario)
        const { data, changed } = applyStreak(cloudData);
        dispatch({ type: 'LOAD', payload: data });
        // Persist cloud save locally so subsequent launches are fast
        try {
          await AsyncStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, lastSaved: Date.now() }));
        } catch { /* ignore */ }
        if (changed) { /* already saved above with streak applied */ }
        return;
      }

      // No valid save anywhere: start fresh
      dispatch({ type: 'RESET' });
    })();
  }, []);

  // Auto-generate NPC orders every ORDER_INTERVAL_MS
  useEffect(() => {
    if (!state.isLoaded) return;
    const pending = state.activeOrders.filter((o) => !o.completed).length;
    // Always seed at least one order immediately if the queue is empty
    if (pending === 0) {
      dispatch({ type: 'ADD_ORDER', order: generateNpcOrder(state.player.level, state.player.forgeLevel) });
    } else {
      // Generate on load if enough time has passed since last order
      const sinceLastOrder = Date.now() - state.lastOrderGeneratedAt;
      if (sinceLastOrder >= ORDER_INTERVAL_MS && pending < MAX_ORDERS) {
        dispatch({ type: 'ADD_ORDER', order: generateNpcOrder(state.player.level, state.player.forgeLevel) });
      }
    }
    const t = setInterval(() => {
      const p = state.activeOrders.filter((o) => !o.completed).length;
      if (p < MAX_ORDERS) {
        dispatch({ type: 'ADD_ORDER', order: generateNpcOrder(state.player.level, state.player.forgeLevel) });
      }
    }, ORDER_INTERVAL_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isLoaded, state.player.level]);

  // Cloud auto-sync every 5 minutes — calls through ref so always uses current state
  useEffect(() => {
    if (!state.isLoaded) return;
    cloudTimerRef.current = setInterval(() => {
      syncToCloudRef.current();
    }, CLOUD_SYNC_INTERVAL_MS);
    return () => {
      if (cloudTimerRef.current) clearInterval(cloudTimerRef.current);
    };
  }, [state.isLoaded]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!state.isLoaded) return;
    const doSave = async () => {
      try {
        const now = Date.now();
        const snapshot: SessionSnapshot = {
          timestamp: now,
          playerLevel: state.player.level,
          gold: state.player.gold,
          totalItemsCrafted: state.player.totalItemsCrafted,
          forgeLevel: state.player.forgeLevel,
          skills: { ...state.player.skills },
        };
        dispatch({ type: 'ADD_SESSION_SNAPSHOT', snapshot });
        const prevSnaps = state.sessionSnapshots;
        const shouldAdd = prevSnaps.length === 0 ||
          now - prevSnaps[prevSnaps.length - 1].timestamp >= 10 * 60 * 1000;
        const updatedSnaps = shouldAdd ? [...prevSnaps, snapshot].slice(-30) : prevSnaps;
        const save: SaveData = {
          version: SAVE_VERSION,
          player: state.player,
          inventory: state.inventory,
          craftedItems: state.craftedItems,
          activeOrders: state.activeOrders,
          completedQuestIds: state.completedQuestIds,
          activeQuestIds: state.activeQuestIds,
          questProgress: state.questProgress,
          unlockedRegions: state.unlockedRegions,
          regionExploration: state.regionExploration,
          npcReputation: state.npcReputation,
          marketPrices: state.marketPrices,
          lastOrderGeneratedAt: state.lastOrderGeneratedAt,
          forgeUpgrades: state.forgeUpgrades,
          forgeHistory: state.forgeHistory,
          sessionSnapshots: updatedSnaps,
          apprentice: state.apprentice,
          lastSaved: now,
        };
        await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(save));
      } catch {
        // silently ignore
      }
    };
    saveTimerRef.current = setInterval(doSave, 30000);
    return () => {
      if (saveTimerRef.current) clearInterval(saveTimerRef.current);
    };
  }, [state]);

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------
  const getResourceById = useCallback(
    (id: string) => ALL_RESOURCES.find((r) => r.id === id),
    [],
  );

  const getRecipeById = useCallback(
    (id: string) => ALL_RECIPES.find((r) => r.id === id),
    [],
  );

  const getInventoryQty = useCallback(
    (resourceId: string) =>
      state.inventory.find((i) => i.resourceId === resourceId)?.quantity ?? 0,
    [state.inventory],
  );

  const canCraftRecipe = useCallback(
    (recipeId: string) => {
      const recipe = ALL_RECIPES.find((r) => r.id === recipeId);
      if (!recipe) return false;
      if (!state.player.unlockedRecipeIds.includes(recipeId)) return false;
      const skillLevel = state.player.skills[recipe.skillRequired] ?? 0;
      if (skillLevel < recipe.levelRequired) return false;
      return recipe.requirements.every(
        (req) =>
          (state.inventory.find((i) => i.resourceId === req.resourceId)?.quantity ?? 0) >=
          req.quantity,
      );
    },
    [state.inventory, state.player.skills, state.player.unlockedRecipeIds],
  );

  const getAvailableRecipes = useCallback(() => {
    return ALL_RECIPES.filter((r) => {
      const skillLevel = state.player.skills[r.skillRequired] ?? 0;
      return state.player.unlockedRecipeIds.includes(r.id) && skillLevel >= r.levelRequired;
    });
  }, [state.player.skills, state.player.unlockedRecipeIds]);

  const getRecipeUnlockCost = useCallback(
    (recipeId: string) => {
      const recipe = ALL_RECIPES.find((candidate) => candidate.id === recipeId);
      return recipe ? recipeUnlockCost(recipe) : 0;
    },
    [],
  );

  const unlockRecipe = useCallback(
    (recipeId: string): boolean => {
      const recipe = ALL_RECIPES.find((candidate) => candidate.id === recipeId);
      if (!recipe || state.player.unlockedRecipeIds.includes(recipeId)) return false;
      const skillLevel = state.player.skills[recipe.skillRequired] ?? 0;
      const cost = recipeUnlockCost(recipe);
      if (skillLevel < recipe.levelRequired || state.player.gold < cost) return false;
      dispatch({ type: 'UNLOCK_RECIPE', recipeId, goldCost: cost });
      return true;
    },
    [state.player.gold, state.player.skills, state.player.unlockedRecipeIds],
  );

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------
  const addResource = useCallback((resourceId: string, qty: number) => {
    dispatch({ type: 'ADD_RESOURCE', resourceId, qty });
  }, []);

  const removeResource = useCallback((resourceId: string, qty: number) => {
    dispatch({ type: 'REMOVE_RESOURCE', resourceId, qty });
  }, []);

  const craftItem = useCallback(
    (recipeId: string): Item | null => {
      const recipe = ALL_RECIPES.find((r) => r.id === recipeId);
      if (!recipe) return null;
      if (!canCraftRecipe(recipeId)) return null;

      // Deduct materials
      for (const req of recipe.requirements) {
        dispatch({ type: 'REMOVE_RESOURCE', resourceId: req.resourceId, qty: req.quantity });
      }

      // Generate quality score based on forge skill (30–100)
      const forgeSkill = state.player.skills['forge'] ?? 1;
      const baseScore = 30 + Math.floor(forgeSkill * 0.7);
      const roll = Math.random() * 30;
      const qualityScore = Math.min(100, Math.floor(baseScore + roll));
      const { quality, rarity } = qualityFromScore(qualityScore);
      const base = recipe.outputItemBase;

      const statMultiplier = valueMultFromQuality(quality);
      const scaledStats: ItemStats = {};
      if (base.baseStats.attack) scaledStats.attack = Math.round(base.baseStats.attack * statMultiplier);
      if (base.baseStats.defense) scaledStats.defense = Math.round(base.baseStats.defense * statMultiplier);
      if (base.baseStats.speed) scaledStats.speed = Math.round(base.baseStats.speed * statMultiplier);
      if (base.baseStats.luck) scaledStats.luck = Math.round(base.baseStats.luck * statMultiplier);
      if (base.baseStats.magic) scaledStats.magic = Math.round(base.baseStats.magic * statMultiplier);

      const item: Item = {
        instanceId: makeId(),
        recipeId,
        name: base.name,
        description: base.description,
        lore: base.lore,
        category: base.category,
        level: recipe.levelRequired,
        quality,
        rarity,
        durability: Math.round(base.durabilityBase * statMultiplier),
        maxDurability: Math.round(base.durabilityBase * statMultiplier),
        weight: base.weight,
        value: Math.round(10 * base.valueMultiplier * statMultiplier * recipe.levelRequired),
        stats: scaledStats,
        gemSlots: base.gemSlots,
        gems: Array(base.gemSlots).fill(null) as (GemData | null)[],
        materials: recipe.requirements.map((r) => r.resourceId),
        craftedBy: state.player.name,
        craftedAt: Date.now(),
        qualityScore,
      };

      dispatch({ type: 'ADD_CRAFTED_ITEM', item });
      dispatch({ type: 'ADD_PLAYER_XP', amount: recipe.xpReward });
      dispatch({ type: 'ADD_SKILL_XP', skill: recipe.skillRequired, amount: recipe.xpReward });
      dispatch({ type: 'UPDATE_QUEST_PROGRESS', objectiveType: 'craft', targetId: recipe.category, amount: 1 });
      dispatch({ type: 'UPDATE_QUEST_PROGRESS', objectiveType: 'craft', targetId: 'any', amount: 1 });

      return item;
    },
    [canCraftRecipe, state.player],
  );

  const craftItemWithScore = useCallback(
    (recipeId: string, qualityScore: number): Item | null => {
      const recipe = ALL_RECIPES.find((r) => r.id === recipeId);
      if (!recipe) return null;
      if (!canCraftRecipe(recipeId)) return null;

      // Deduct materials
      for (const req of recipe.requirements) {
        dispatch({ type: 'REMOVE_RESOURCE', resourceId: req.resourceId, qty: req.quantity });
      }

      const talentQualityBonus = computeTalentBonus(state.player.talentsUnlocked, 'qualityBonus') * 100;
      const clampedScore = Math.max(0, Math.min(100, Math.round(qualityScore + talentQualityBonus)));
      const { quality, rarity } = qualityFromScore(clampedScore);
      const base = recipe.outputItemBase;

      const statMultiplier = valueMultFromQuality(quality);
      const scaledStats: ItemStats = {};
      if (base.baseStats.attack) scaledStats.attack = Math.round(base.baseStats.attack * statMultiplier);
      if (base.baseStats.defense) scaledStats.defense = Math.round(base.baseStats.defense * statMultiplier);
      if (base.baseStats.speed) scaledStats.speed = Math.round(base.baseStats.speed * statMultiplier);
      if (base.baseStats.luck) scaledStats.luck = Math.round(base.baseStats.luck * statMultiplier);
      if (base.baseStats.magic) scaledStats.magic = Math.round(base.baseStats.magic * statMultiplier);

      const item: Item = {
        instanceId: makeId(),
        recipeId,
        name: base.name,
        description: base.description,
        lore: base.lore,
        category: base.category,
        level: recipe.levelRequired,
        quality,
        rarity,
        durability: Math.round(base.durabilityBase * statMultiplier),
        maxDurability: Math.round(base.durabilityBase * statMultiplier),
        weight: base.weight,
        value: Math.round(10 * base.valueMultiplier * statMultiplier * recipe.levelRequired),
        stats: scaledStats,
        gemSlots: base.gemSlots,
        gems: Array(base.gemSlots).fill(null) as (GemData | null)[],
        materials: recipe.requirements.map((r) => r.resourceId),
        craftedBy: state.player.name,
        craftedAt: Date.now(),
        qualityScore: clampedScore,
      };

      dispatch({ type: 'ADD_CRAFTED_ITEM', item });
      dispatch({ type: 'ADD_PLAYER_XP', amount: recipe.xpReward });
      dispatch({ type: 'ADD_SKILL_XP', skill: recipe.skillRequired, amount: recipe.xpReward });
      dispatch({ type: 'UPDATE_QUEST_PROGRESS', objectiveType: 'craft', targetId: recipe.category, amount: 1 });
      dispatch({ type: 'UPDATE_QUEST_PROGRESS', objectiveType: 'craft', targetId: 'any', amount: 1 });

      return item;
    },
    [canCraftRecipe, state.player],
  );

  const addGold = useCallback((amount: number) => {
    dispatch({ type: 'ADD_GOLD', amount });
  }, []);

  const spendGold = useCallback(
    (amount: number): boolean => {
      if (state.player.gold < amount) return false;
      dispatch({ type: 'SPEND_GOLD', amount });
      return true;
    },
    [state.player.gold],
  );

  const addPlayerXP = useCallback((amount: number) => {
    dispatch({ type: 'ADD_PLAYER_XP', amount });
  }, []);

  const addSkillXP = useCallback((skill: SkillType, amount: number) => {
    dispatch({ type: 'ADD_SKILL_XP', skill, amount });
  }, []);

  const collectFromRegion = useCallback(
    (regionId: string): { resourceId: string; quantity: number }[] => {
      const region = ALL_REGIONS.find((r) => r.id === regionId);
      if (!region) return [];
      if (!state.unlockedRegions.includes(regionId)) return [];

      const collectBonus = Math.floor(computeTalentBonus(state.player.talentsUnlocked, 'collectBonus'));
      const collectYield = computeTalentBonus(state.player.talentsUnlocked, 'collectYield');
      const drops: { resourceId: string; quantity: number }[] = [];
      for (const node of region.resourceNodes) {
        if (Math.random() < node.dropRate) {
          const baseQty = Math.floor(
            Math.random() * (node.maxQty - node.minQty + 1) + node.minQty,
          );
          const qty = Math.max(1, Math.round((baseQty + collectBonus) * (1 + collectYield)));
          drops.push({ resourceId: node.resourceId, quantity: qty });
          dispatch({ type: 'ADD_RESOURCE', resourceId: node.resourceId, qty });
        }
      }

      // Update exploration percent
      const currentExploration = state.regionExploration[regionId] ?? 0;
      const gain = Math.floor(Math.random() * 5 + 1);
      dispatch({
        type: 'SET_EXPLORATION',
        regionId,
        percent: currentExploration + gain,
      });

      // Reward harvest XP + quest progress
      if (drops.length > 0) {
        dispatch({ type: 'ADD_SKILL_XP', skill: 'harvest', amount: drops.length * 3 });
        dispatch({ type: 'ADD_PLAYER_XP', amount: drops.length * 2 });
        for (const drop of drops) {
          dispatch({ type: 'UPDATE_QUEST_PROGRESS', objectiveType: 'collect', targetId: drop.resourceId, amount: drop.quantity });
        }
      }

      return drops;
    },
    [state.unlockedRegions, state.regionExploration, state.player.talentsUnlocked],
  );

  const unlockRegion = useCallback((regionId: string) => {
    dispatch({ type: 'UNLOCK_REGION', regionId });
  }, []);

  const addExploration = useCallback((regionId: string, gain: number) => {
    dispatch({ type: 'ADD_EXPLORATION', regionId, gain });
  }, []);

  const fightForMaterials = useCallback(
    (regionId: string, playerTotal: number, enemyTotal: number): CombatResult => {
      const region = ALL_REGIONS.find((candidate) => candidate.id === regionId);
      if (!region || !state.unlockedRegions.includes(regionId)) {
        return {
          won: false,
          playerRoll: playerTotal,
          enemyRoll: enemyTotal,
          drops: [],
          message: 'Cette région n’est pas accessible.',
        };
      }

      const won = playerTotal > enemyTotal;
      const drops: CombatDrop[] = [];
      if (won) {
        // Combat rewards favour the region’s own materials. Two independent
        // rolls make a win useful without flooding the inventory.
        const candidates = region.resourceNodes
          .filter((node) => Math.random() <= Math.min(1, node.dropRate + 0.15))
          .slice(0, 2);
        for (const node of candidates.length > 0 ? candidates : region.resourceNodes.slice(0, 1)) {
          const quantity = Math.max(
            1,
            Math.floor(Math.random() * (node.maxQty - node.minQty + 1) + node.minQty),
          );
          drops.push({ resourceId: node.resourceId, quantity });
          dispatch({ type: 'ADD_RESOURCE', resourceId: node.resourceId, qty: quantity });
          dispatch({
            type: 'UPDATE_QUEST_PROGRESS',
            objectiveType: 'collect',
            targetId: node.resourceId,
            amount: quantity,
          });
        }
        dispatch({ type: 'ADD_SKILL_XP', skill: 'combat', amount: 12 + region.levelRequired });
        dispatch({ type: 'ADD_PLAYER_XP', amount: 8 + region.levelRequired });
        dispatch({ type: 'ADD_EXPLORATION', regionId, gain: 2 });
      } else {
        dispatch({ type: 'ADD_SKILL_XP', skill: 'combat', amount: 3 });
        dispatch({ type: 'ADD_PLAYER_XP', amount: 2 });
      }

      return {
        won,
        playerRoll: playerTotal,
        enemyRoll: enemyTotal,
        drops,
        message: won
          ? `Victoire contre ${region.boss.name} !`
          : `${region.boss.name} vous repousse. Revenez plus fort !`,
      };
    },
    [state.unlockedRegions],
  );

  // -------------------------------------------------------------------------
  // NPC Order actions
  // -------------------------------------------------------------------------
  const acceptOrder = useCallback((orderId: string) => {
    dispatch({ type: 'ACCEPT_ORDER', orderId });
  }, []);

  const refuseOrder = useCallback((orderId: string) => {
    dispatch({ type: 'REFUSE_ORDER', orderId });
  }, []);

  const deliverOrder = useCallback(
    (orderId: string, itemInstanceId: string): { success: boolean; message: string } => {
      const order = state.activeOrders.find((o) => o.id === orderId);
      const item = state.craftedItems.find((i) => i.instanceId === itemInstanceId);
      if (!order || !item) return { success: false, message: 'Commande ou objet introuvable.' };
      if (item.category !== order.requestedCategory)
        return { success: false, message: `Cet objet n'est pas de la bonne catégorie (${order.requestedCategory}).` };
      // Check minimum quality
      if (QUALITY_ORDER[item.quality] < QUALITY_ORDER[order.minQuality])
        return { success: false, message: `Qualité insuffisante (${item.quality} < ${order.minQuality} requis).` };
      dispatch({ type: 'DELIVER_ORDER', orderId, itemInstanceId });
      dispatch({ type: 'ADD_PLAYER_XP', amount: order.xpReward });
      dispatch({ type: 'ADD_SKILL_XP', skill: 'commerce', amount: Math.round(order.xpReward * 0.5) });
      return { success: true, message: 'Livraison effectuée avec succès !' };
    },
    [state.activeOrders, state.craftedItems],
  );

  const buyResource = useCallback(
    (resourceId: string, qty: number): boolean => {
      const res = ALL_RESOURCES.find((r) => r.id === resourceId);
      if (!res) return false;
      const unitPrice = Math.round(res.baseValue * 1.35);
      const goldCost = unitPrice * qty;
      if (state.player.gold < goldCost) return false;
      dispatch({ type: 'BUY_RESOURCE', resourceId, qty, goldCost });
      return true;
    },
    [state.player.gold],
  );

  const rerollOrder = useCallback(
    (orderId: string): { success: boolean; cost: number } => {
      const order = state.activeOrders.find((o) => o.id === orderId);
      if (!order || order.accepted) return { success: false, cost: 0 };
      const cost = Math.max(30, Math.round(state.player.level * 8));
      if (state.player.gold < cost) return { success: false, cost };
      const newOrder = generateNpcOrder(state.player.level, state.player.forgeLevel);
      dispatch({ type: 'REROLL_ORDER', orderId, newOrder, goldCost: cost });
      return { success: true, cost };
    },
    [state.activeOrders, state.player.gold, state.player.level, state.player.forgeLevel],
  );

  // -------------------------------------------------------------------------
  // Quest actions
  // -------------------------------------------------------------------------
  const acceptQuest = useCallback((questId: string) => {
    dispatch({ type: 'ACCEPT_QUEST', questId });
  }, []);

  const getActiveQuests = useCallback((): (Quest & { progress: Record<string, number> })[] => {
    return state.activeQuestIds.map((qid) => {
      const q = ALL_QUESTS.find((x) => x.id === qid);
      if (!q) return null;
      return { ...q, progress: state.questProgress[qid] ?? {} };
    }).filter(Boolean) as (Quest & { progress: Record<string, number> })[];
  }, [state.activeQuestIds, state.questProgress]);

  const updateQuestProgress = useCallback(
    (objectiveType: 'craft' | 'collect' | 'sell' | 'deliver', targetId: string, amount: number) => {
      dispatch({ type: 'UPDATE_QUEST_PROGRESS', objectiveType, targetId, amount });
    },
    [],
  );

  // -------------------------------------------------------------------------
  // Market & selling
  // -------------------------------------------------------------------------
  const getMarketPrice = useCallback(
    (resourceId: string): number => {
      const res = ALL_RESOURCES.find((r) => r.id === resourceId);
      const mult = state.marketPrices[resourceId] ?? 1.0;
      return Math.round((res?.baseValue ?? 10) * mult);
    },
    [state.marketPrices],
  );

  const sellItem = useCallback(
    (instanceId: string): number => {
      const item = state.craftedItems.find((i) => i.instanceId === instanceId);
      if (!item) return 0;
      const sellBonus = 1
        + computeTalentBonus(state.player.talentsUnlocked, 'sellPriceBonus')
        + computeTalentBonus(state.player.talentsUnlocked, 'allGoldBonus');
      const goldAmount = Math.round(item.value * 0.85 * sellBonus);
      dispatch({ type: 'SELL_ITEM', instanceId, goldAmount });
      dispatch({ type: 'ADD_SKILL_XP', skill: 'commerce', amount: 5 });
      dispatch({ type: 'UPDATE_QUEST_PROGRESS', objectiveType: 'sell', targetId: item.category, amount: 1 });
      dispatch({ type: 'UPDATE_QUEST_PROGRESS', objectiveType: 'sell', targetId: 'any', amount: 1 });
      return goldAmount;
    },
    [state.craftedItems, state.player.talentsUnlocked],
  );

  const sellResource = useCallback(
    (resourceId: string, qty: number): number => {
      const inv = state.inventory.find((i) => i.resourceId === resourceId);
      if (!inv || inv.quantity < qty) return 0;
      const res = ALL_RESOURCES.find((r) => r.id === resourceId);
      const pricePerUnit = Math.round((res?.baseValue ?? 10) * (state.marketPrices[resourceId] ?? 1.0) * 0.8);
      const sellBonus = 1
        + computeTalentBonus(state.player.talentsUnlocked, 'sellPriceBonus')
        + computeTalentBonus(state.player.talentsUnlocked, 'allGoldBonus');
      const goldAmount = Math.round(pricePerUnit * qty * sellBonus);
      dispatch({ type: 'SELL_RESOURCE', resourceId, qty, goldAmount });
      dispatch({ type: 'ADJUST_MARKET', resourceId, delta: -0.03 * qty }); // selling reduces price
      dispatch({ type: 'ADD_SKILL_XP', skill: 'commerce', amount: qty });
      return goldAmount;
    },
    [state.inventory, state.marketPrices, state.player.talentsUnlocked],
  );

  const meltItem = useCallback(
    (instanceId: string): { success: boolean; message: string; recovered: CombatDrop[] } => {
      const item = state.craftedItems.find((candidate) => candidate.instanceId === instanceId);
      if (!item) return { success: false, message: 'Objet introuvable.', recovered: [] };

      const recipe = ALL_RECIPES.find((candidate) => candidate.id === item.recipeId);
      const qualityYield: Record<Quality, number> = {
        poor: 0.45,
        normal: 0.6,
        good: 0.7,
        excellent: 0.82,
        legendary: 0.95,
      };
      const yieldRate = qualityYield[item.quality] ?? 0.6;
      const totals = new Map<string, number>();
      const requirements = recipe?.requirements ?? item.materials.map((resourceId) => ({ resourceId, quantity: 1 }));
      for (const requirement of requirements) {
        const quantity = Math.max(1, Math.floor(requirement.quantity * yieldRate));
        totals.set(requirement.resourceId, (totals.get(requirement.resourceId) ?? 0) + quantity);
      }
      const recovered = Array.from(totals, ([resourceId, quantity]) => ({ resourceId, quantity }));
      dispatch({ type: 'MELT_ITEM', instanceId, recovered });
      dispatch({ type: 'ADD_SKILL_XP', skill: 'forge', amount: 4 });
      return {
        success: true,
        message: `Fonte terminée : ${recovered.reduce((sum, drop) => sum + drop.quantity, 0)} matériau(x) récupéré(s).`,
        recovered,
      };
    },
    [state.craftedItems],
  );

  // -------------------------------------------------------------------------
  // Gem socket actions
  // -------------------------------------------------------------------------
  const getSocketableGems = useCallback((): GemData[] => {
    return ALL_GEMS.filter(
      (gem) => (state.inventory.find((i) => i.resourceId === gem.type)?.quantity ?? 0) > 0,
    );
  }, [state.inventory]);

  const socketGem = useCallback(
    (itemInstanceId: string, slotIndex: number, gem: GemData): boolean => {
      const item = state.craftedItems.find((i) => i.instanceId === itemInstanceId);
      if (!item) return false;
      if (slotIndex < 0 || slotIndex >= item.gemSlots) return false;
      if (item.gems[slotIndex] !== null) return false;
      const qty = state.inventory.find((i) => i.resourceId === gem.type)?.quantity ?? 0;
      if (qty <= 0) return false;
      dispatch({ type: 'SOCKET_GEM', itemInstanceId, slotIndex, gem });
      return true;
    },
    [state.craftedItems, state.inventory],
  );

  const removeGem = useCallback(
    (itemInstanceId: string, slotIndex: number): void => {
      const item = state.craftedItems.find((i) => i.instanceId === itemInstanceId);
      if (!item) return;
      if (slotIndex < 0 || slotIndex >= item.gemSlots) return;
      if (!item.gems[slotIndex]) return;
      dispatch({ type: 'REMOVE_GEM', itemInstanceId, slotIndex });
    },
    [state.craftedItems],
  );

  /** Current total inventory weight (resources + crafted items). */
  const currentWeight = useMemo(() => {
    const rw = state.inventory.reduce((acc, inv) => {
      const res = ALL_RESOURCES.find((r) => r.id === inv.resourceId);
      return acc + (res?.weight ?? 0) * inv.quantity;
    }, 0);
    const iw = state.craftedItems.reduce((acc, item) => acc + item.weight, 0);
    return rw + iw;
  }, [state.inventory, state.craftedItems]);

  const maxWeight = useMemo(
    () =>
      MAX_WEIGHT_BASE +
      state.player.level * MAX_WEIGHT_PER_LEVEL +
      computeTalentBonus(state.player.talentsUnlocked, 'weightBonus'),
    [state.player.level, state.player.talentsUnlocked],
  );

  const saveGame = useCallback(async () => {
    const now = Date.now();
    const snapshot: SessionSnapshot = {
      timestamp: now,
      playerLevel: state.player.level,
      gold: state.player.gold,
      totalItemsCrafted: state.player.totalItemsCrafted,
      forgeLevel: state.player.forgeLevel,
      skills: { ...state.player.skills },
    };
    dispatch({ type: 'ADD_SESSION_SNAPSHOT', snapshot });
    const prevSnaps = state.sessionSnapshots;
    const shouldAdd = prevSnaps.length === 0 ||
      now - prevSnaps[prevSnaps.length - 1].timestamp >= 10 * 60 * 1000;
    const updatedSnaps = shouldAdd ? [...prevSnaps, snapshot].slice(-30) : prevSnaps;
    const save: SaveData = {
      version: SAVE_VERSION,
      player: state.player,
      inventory: state.inventory,
      craftedItems: state.craftedItems,
      activeOrders: state.activeOrders,
      completedQuestIds: state.completedQuestIds,
      activeQuestIds: state.activeQuestIds,
      questProgress: state.questProgress,
      unlockedRegions: state.unlockedRegions,
      regionExploration: state.regionExploration,
      npcReputation: state.npcReputation,
      marketPrices: state.marketPrices,
      lastOrderGeneratedAt: state.lastOrderGeneratedAt,
      forgeUpgrades: state.forgeUpgrades,
      forgeHistory: state.forgeHistory,
      sessionSnapshots: updatedSnaps,
      apprentice: state.apprentice,
      lastSaved: now,
    };
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }, [state]);

  const syncToCloud = useCallback(async () => {
    const base = getCloudApiBase();
    if (!base || !playerIdRef.current || !state.isLoaded) return;
    setCloudSyncStatus('syncing');
    try {
      const save: SaveData = {
        version: SAVE_VERSION,
        player: state.player,
        inventory: state.inventory,
        craftedItems: state.craftedItems,
        activeOrders: state.activeOrders,
        completedQuestIds: state.completedQuestIds,
        activeQuestIds: state.activeQuestIds,
        questProgress: state.questProgress,
        unlockedRegions: state.unlockedRegions,
        regionExploration: state.regionExploration,
        npcReputation: state.npcReputation,
        marketPrices: state.marketPrices,
        lastOrderGeneratedAt: state.lastOrderGeneratedAt,
        forgeUpgrades: state.forgeUpgrades,
        forgeHistory: state.forgeHistory,
        sessionSnapshots: state.sessionSnapshots,
        apprentice: state.apprentice,
        lastSaved: Date.now(),
      };
      const res = await fetch(`${base}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: playerIdRef.current, saveData: save, clientVersion: SAVE_VERSION }),
      });
      if (res.ok) {
        setCloudSyncStatus('success');
        setLastCloudSync(Date.now());
        // Reset to idle after 3 seconds
        setTimeout(() => setCloudSyncStatus('idle'), 3000);
      } else {
        setCloudSyncStatus('error');
        setTimeout(() => setCloudSyncStatus('idle'), 5000);
      }
    } catch {
      setCloudSyncStatus('error');
      setTimeout(() => setCloudSyncStatus('idle'), 5000);
    }
  }, [state]);

  // Keep ref pointing to latest syncToCloud so the auto-sync interval never captures a stale closure
  useEffect(() => {
    syncToCloudRef.current = syncToCloud;
  }, [syncToCloud]);

  const resetGame = useCallback(() => {
    dispatch({ type: 'RESET' });
    AsyncStorage.removeItem(SAVE_KEY).catch(() => {});
  }, []);

  // -------------------------------------------------------------------------
  // Progression helpers
  // -------------------------------------------------------------------------
  const getTalentBonus = useCallback(
    (bonusType: string): number =>
      computeTalentBonus(state.player.talentsUnlocked, bonusType),
    [state.player.talentsUnlocked],
  );

  const upgradeForgeElement = useCallback(
    (element: string): { success: boolean; message: string } => {
      const upgradeData = ALL_FORGE_UPGRADES.find((u) => u.id === element);
      if (!upgradeData) return { success: false, message: 'Élément introuvable.' };
      const currentLevel = state.forgeUpgrades[element] ?? 0;
      if (currentLevel >= 5) return { success: false, message: 'Déjà au niveau maximum.' };
      const tier = upgradeData.tiers[currentLevel];
      if (!tier) return { success: false, message: 'Niveau invalide.' };
      const costReduction = Math.min(0.5, computeTalentBonus(state.player.talentsUnlocked, 'upgradeCostReduction'));
      const goldCost = Math.round(tier.goldCost * (1 - costReduction));
      if (state.player.gold < goldCost) {
        return { success: false, message: `Or insuffisant (${goldCost}g requis, ${state.player.gold}g disponible).` };
      }
      for (const rc of tier.resourceCosts) {
        const have = state.inventory.find((i) => i.resourceId === rc.resourceId)?.quantity ?? 0;
        if (have < rc.qty) {
          const res = ALL_RESOURCES.find((r) => r.id === rc.resourceId);
          return { success: false, message: `${res?.name ?? rc.resourceId} insuffisant (${rc.qty} requis, ${have} disponible).` };
        }
      }
      dispatch({ type: 'UPGRADE_FORGE_ELEMENT', element, goldCost, resourceCosts: tier.resourceCosts });
      return { success: true, message: `${upgradeData.name} améliorée au niveau ${currentLevel + 1} !` };
    },
    [state.forgeUpgrades, state.player.gold, state.player.talentsUnlocked, state.inventory],
  );

  // -------------------------------------------------------------------------
  // Apprentice callbacks
  // -------------------------------------------------------------------------
  const hireApprentice = useCallback((): boolean => {
    if (state.apprentice) return false;
    if (state.player.gold < APPRENTICE_HIRE_COST) return false;
    const name = APPRENTICE_NAMES[Math.floor(Math.random() * APPRENTICE_NAMES.length)];
    dispatch({ type: 'HIRE_APPRENTICE', name });
    return true;
  }, [state.apprentice, state.player.gold]);

  const dismissApprentice = useCallback(() => {
    dispatch({ type: 'DISMISS_APPRENTICE' });
  }, []);

  const assignApprenticeRecipe = useCallback((recipeId: string): boolean => {
    if (!state.apprentice) return false;
    const recipe = ALL_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return false;
    const durationMs = apprenticeCraftDuration(recipe, state.apprentice.level);
    dispatch({ type: 'ASSIGN_APPRENTICE_RECIPE', recipeId, durationMs });
    return true;
  }, [state.apprentice]);

  const collectApprenticeItem = useCallback((): Item | null => {
    const item = state.apprentice?.readyItem ?? null;
    if (!item) return null;
    dispatch({ type: 'COLLECT_APPRENTICE_ITEM' });
    return item;
  }, [state.apprentice]);

  const trainApprentice = useCallback((): { success: boolean; cost: number; message: string } => {
    if (!state.apprentice) return { success: false, cost: 0, message: 'Pas d\'apprenti.' };
    if (state.apprentice.level >= 10) return { success: false, cost: 0, message: 'Niveau maximum atteint.' };
    const cost = Math.round(300 * Math.pow(1.8, state.apprentice.level - 1));
    if (state.player.gold < cost) return { success: false, cost, message: `Or insuffisant (${cost}g requis).` };
    dispatch({ type: 'TRAIN_APPRENTICE', goldCost: cost });
    return { success: true, cost, message: `${state.apprentice.name} est maintenant niveau ${state.apprentice.level + 1} !` };
  }, [state.apprentice, state.player.gold]);

  // Timer: check every 30 s whether the apprentice has finished crafting
  useEffect(() => {
    if (!state.isLoaded) return;
    const t = setInterval(() => {
      const ap = state.apprentice;
      if (!ap || ap.readyItem || !ap.craftStartedAt || !ap.assignedRecipeId) return;
      if (Date.now() - ap.craftStartedAt >= ap.craftDurationMs) {
        const recipe = ALL_RECIPES.find((r) => r.id === ap.assignedRecipeId);
        if (recipe) {
          dispatch({ type: 'APPRENTICE_FINISH_CRAFT', item: makeApprenticeItem(recipe, ap.level) });
        }
      }
    }, 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isLoaded, state.apprentice]);

  const customizePlayer = useCallback(
    (name: string, forgeName: string, avatarColor?: string, avatarIcon?: string | null, avatarImage?: string | null): void => {
      const trimmedName = name.trim();
      const trimmedForgeName = forgeName.trim();
      if (trimmedName.length < 2 || trimmedName.length > 24) return;
      if (trimmedForgeName.length < 2 || trimmedForgeName.length > 32) return;
      dispatch({ type: 'CUSTOMIZE_PLAYER', name: trimmedName, forgeName: trimmedForgeName, avatarColor, avatarIcon, avatarImage });
    },
    [],
  );

  const unlockTalent = useCallback(
    (talentId: string): boolean => {
      const talent = ALL_TALENTS.find((t) => t.id === talentId);
      if (!talent) return false;
      if (state.player.talentsUnlocked.includes(talentId)) return false;
      if (state.player.talentPoints < talent.cost) return false;
      if (talent.requiredSkill) {
        if ((state.player.skills[talent.requiredSkill] ?? 0) < talent.requiredSkillLevel) return false;
      } else {
        const maxSkillLevel = Math.max(...Object.values(state.player.skills).map(Number));
        if (maxSkillLevel < talent.requiredSkillLevel) return false;
      }
      for (const prereqId of talent.prerequisiteIds) {
        if (!state.player.talentsUnlocked.includes(prereqId)) return false;
      }
      dispatch({ type: 'UNLOCK_TALENT', talentId, cost: talent.cost });
      return true;
    },
    [state.player.talentsUnlocked, state.player.talentPoints, state.player.skills],
  );

  // -------------------------------------------------------------------------
  // Context value (memoized to avoid re-renders)
  // -------------------------------------------------------------------------
  const value = useMemo<GameContextType>(
    () => ({
      isLoaded: state.isLoaded,
      player: state.player,
      inventory: state.inventory,
      craftedItems: state.craftedItems,
      activeOrders: state.activeOrders,
      unlockedRegions: state.unlockedRegions,
      regionExploration: state.regionExploration,
      npcReputation: state.npcReputation,
      marketPrices: state.marketPrices,
      activeQuestIds: state.activeQuestIds,
      completedQuestIds: state.completedQuestIds,
      questProgress: state.questProgress,
      allResources: ALL_RESOURCES,
      allRecipes: ALL_RECIPES,
      allRegions: ALL_REGIONS,
      allSkills: ALL_SKILLS,
      allGems: ALL_GEMS,
      allNPCs: ALL_NPCS,
      allQuests: ALL_QUESTS,
      maxWeight,
      getResourceById,
      getRecipeById,
       getRecipeUnlockCost,
      getInventoryQty,
      canCraftRecipe,
      getAvailableRecipes,
       unlockRecipe,
      getSocketableGems,
      getActiveQuests,
      getMarketPrice,
      addResource,
      removeResource,
      craftItem,
      craftItemWithScore,
      socketGem,
      removeGem,
      acceptOrder,
      refuseOrder,
      deliverOrder,
      acceptQuest,
      updateQuestProgress,
      sellItem,
      sellResource,
      buyResource,
      rerollOrder,
      addGold,
      spendGold,
      addPlayerXP,
      addSkillXP,
      collectFromRegion,
      unlockRegion,
      addExploration,
      fightForMaterials,
      saveGame,
      resetGame,
      allTalents: ALL_TALENTS,
      allForgeUpgrades: ALL_FORGE_UPGRADES,
      forgeUpgrades: state.forgeUpgrades,
      upgradeForgeElement,
      unlockTalent,
      meltItem,
      getTalentBonus,
      // Forge history
      forgeHistory: state.forgeHistory,
      // Session snapshots
      sessionSnapshots: state.sessionSnapshots,
      // Cloud sync
      cloudSyncStatus,
      lastCloudSync,
      syncToCloud,
      // Customization
      customizePlayer,
      // Apprentice
      apprentice: state.apprentice,
      hireApprentice,
      dismissApprentice,
      assignApprenticeRecipe,
      collectApprenticeItem,
      trainApprentice,
    }),
    // Include cloud sync reactive state so status transitions propagate to consumers
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state, cloudSyncStatus, lastCloudSync],
  );

  return <GameContext.Provider value={value}>{children}</GameContext.Provider>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useGame(): GameContextType {
  const ctx = useContext(GameContext);
  if (!ctx) throw new Error('useGame must be used within GameProvider');
  return ctx;
}
