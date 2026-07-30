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
  CraftOrder,
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
  return level * 100;
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
}

type GameAction =
  | { type: 'LOAD'; payload: SaveData }
  | { type: 'RESET' }
  | { type: 'ADD_RESOURCE'; resourceId: string; qty: number }
  | { type: 'REMOVE_RESOURCE'; resourceId: string; qty: number }
  | { type: 'ADD_CRAFTED_ITEM'; item: Item }
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
  | { type: 'UNLOCK_TALENT'; talentId: string; cost: number };

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
    level: 1,
    xp: 0,
    xpToNextLevel: 100,
    gold: 150,
    forgeLevel: 1,
    skills,
    skillXP,
    talentsUnlocked: [],
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
  };
}

/** Generate a random NPC order based on player level */
function generateNpcOrder(playerLevel: number, forgeLevel: number): CraftOrder {
  const npc = ALL_NPCS[Math.floor(Math.random() * ALL_NPCS.length)];
  // Pick a recipe matching NPC preferences and player level
  const eligible = ALL_RECIPES.filter((r) => {
    const matchesCategory = npc.preferredCategories.includes(r.category);
    return matchesCategory && r.levelRequired <= playerLevel + 2;
  });
  const recipe = eligible.length > 0
    ? eligible[Math.floor(Math.random() * eligible.length)]
    : ALL_RECIPES[Math.floor(Math.random() * ALL_RECIPES.length)];

  const budgetRange = npc.budgetMax - npc.budgetMin;
  const goldReward = Math.round(npc.budgetMin + Math.random() * budgetRange);
  const xpReward = Math.round(recipe.xpReward * (1.5 + Math.random()));
  const repReward = Math.round(5 + Math.random() * 15);
  // Deadline: 4–12 hours from now
  const deadlineHours = 4 + Math.floor(Math.random() * 9);
  const deadline = Date.now() + deadlineHours * 60 * 60 * 1000;

  const minQualityIdx = QUALITY_ORDER[npc.minQuality] ?? 1;
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
  while (xp >= xpToNextLevel) {
    xp -= xpToNextLevel;
    level += 1;
    xpToNextLevel = xpForLevel(level);
  }
  return { ...player, xp, level, xpToNextLevel };
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
    // Award talent point every 5 skill levels
    const talentPoints = result.talentPoints + (newLevel % 5 === 0 ? 1 : 0);
    result = { ...result, skillXP, skills, talentPoints };
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
      let player: Player = {
        ...s.player,
        talentPoints: s.player.talentPoints ?? 0,
        talentsUnlocked: s.player.talentsUnlocked ?? [],
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
      const updated = levelUpSkill(state.player, action.skill, action.amount);
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
  getInventoryQty: (resourceId: string) => number;
  canCraftRecipe: (recipeId: string) => boolean;
  getAvailableRecipes: () => RecipeData[];
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
  addGold: (amount: number) => void;
  spendGold: (amount: number) => boolean;
  addPlayerXP: (amount: number) => void;
  addSkillXP: (skill: SkillType, amount: number) => void;
  collectFromRegion: (regionId: string) => { resourceId: string; quantity: number }[];
  unlockRegion: (regionId: string) => void;
  addExploration: (regionId: string, gain: number) => void;
  saveGame: () => Promise<void>;
  resetGame: () => void;
  // Progression
  allTalents: TalentData[];
  allForgeUpgrades: ForgeUpgradeData[];
  forgeUpgrades: Record<string, number>;
  upgradeForgeElement: (element: string) => { success: boolean; message: string };
  unlockTalent: (talentId: string) => boolean;
  getTalentBonus: (bonusType: string) => number;
  // Forge history
  forgeHistory: ForgeHistoryEntry[];
  // Cloud sync
  cloudSyncStatus: CloudSyncStatus;
  lastCloudSync: number | null;
  syncToCloud: () => Promise<void>;
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
      try {
        // Ensure persistent player ID exists
        let pid = await AsyncStorage.getItem(PLAYER_ID_KEY);
        if (!pid) {
          pid = makeId();
          await AsyncStorage.setItem(PLAYER_ID_KEY, pid);
        }
        playerIdRef.current = pid;
      } catch {
        playerIdRef.current = makeId();
      }

      try {
        const raw = await AsyncStorage.getItem(SAVE_KEY);
        if (raw) {
          const data: SaveData = JSON.parse(raw);
          if (data.version === SAVE_VERSION) {
            // Compute streak update here (before dispatch) so it's saved atomically
            const todayMidnight = new Date();
            todayMidnight.setHours(0, 0, 0, 0);
            const todayMs = todayMidnight.getTime();
            const yesterdayMs = todayMs - 86400000;
            const lastPlayed = data.player.lastPlayedDate ?? 0;
            let streakChanged = false;
            if (lastPlayed < todayMs) {
              if (lastPlayed >= yesterdayMs) {
                // Played yesterday — continue streak
                data.player = { ...data.player, streak: (data.player.streak ?? 1) + 1, lastPlayedDate: todayMs };
              } else {
                // Missed a day or first session — reset streak
                data.player = { ...data.player, streak: 1, lastPlayedDate: todayMs };
              }
              streakChanged = true;
            }
            dispatch({ type: 'LOAD', payload: data });
            // Save immediately so streak persists even if user quits before autosave
            if (streakChanged) {
              try {
                await AsyncStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, lastSaved: Date.now() }));
              } catch { /* ignore */ }
            }
            return;
          }
        }
      } catch {
        // ignore parse errors — start fresh
      }
      // No valid save: start fresh but mark as loaded
      dispatch({ type: 'RESET' });
    })();
  }, []);

  // Auto-generate NPC orders every ORDER_INTERVAL_MS
  useEffect(() => {
    if (!state.isLoaded) return;
    // Generate on load if enough time has passed
    const sinceLastOrder = Date.now() - state.lastOrderGeneratedAt;
    if (sinceLastOrder >= ORDER_INTERVAL_MS && state.activeOrders.filter((o) => !o.completed).length < MAX_ORDERS) {
      dispatch({ type: 'ADD_ORDER', order: generateNpcOrder(state.player.level, state.player.forgeLevel) });
    }
    const t = setInterval(() => {
      const pending = state.activeOrders.filter((o) => !o.completed).length;
      if (pending < MAX_ORDERS) {
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
          lastSaved: Date.now(),
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
      const skillLevel = state.player.skills[recipe.skillRequired] ?? 0;
      if (skillLevel < recipe.levelRequired) return false;
      return recipe.requirements.every(
        (req) =>
          (state.inventory.find((i) => i.resourceId === req.resourceId)?.quantity ?? 0) >=
          req.quantity,
      );
    },
    [state.inventory, state.player.skills],
  );

  const getAvailableRecipes = useCallback(() => {
    return ALL_RECIPES.filter((r) => {
      const skillLevel = state.player.skills[r.skillRequired] ?? 0;
      return skillLevel >= r.levelRequired;
    });
  }, [state.player.skills]);

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

      const clampedScore = Math.max(0, Math.min(100, Math.round(qualityScore)));
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

      const drops: { resourceId: string; quantity: number }[] = [];
      for (const node of region.resourceNodes) {
        if (Math.random() < node.dropRate) {
          const qty = Math.floor(
            Math.random() * (node.maxQty - node.minQty + 1) + node.minQty,
          );
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
    [state.unlockedRegions, state.regionExploration],
  );

  const unlockRegion = useCallback((regionId: string) => {
    dispatch({ type: 'UNLOCK_REGION', regionId });
  }, []);

  const addExploration = useCallback((regionId: string, gain: number) => {
    dispatch({ type: 'ADD_EXPLORATION', regionId, gain });
  }, []);

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
      const goldAmount = Math.round(item.value * 0.85);
      dispatch({ type: 'SELL_ITEM', instanceId, goldAmount });
      dispatch({ type: 'ADD_SKILL_XP', skill: 'commerce', amount: 5 });
      dispatch({ type: 'UPDATE_QUEST_PROGRESS', objectiveType: 'sell', targetId: item.category, amount: 1 });
      dispatch({ type: 'UPDATE_QUEST_PROGRESS', objectiveType: 'sell', targetId: 'any', amount: 1 });
      return goldAmount;
    },
    [state.craftedItems],
  );

  const sellResource = useCallback(
    (resourceId: string, qty: number): number => {
      const inv = state.inventory.find((i) => i.resourceId === resourceId);
      if (!inv || inv.quantity < qty) return 0;
      const res = ALL_RESOURCES.find((r) => r.id === resourceId);
      const pricePerUnit = Math.round((res?.baseValue ?? 10) * (state.marketPrices[resourceId] ?? 1.0) * 0.8);
      const goldAmount = pricePerUnit * qty;
      dispatch({ type: 'SELL_RESOURCE', resourceId, qty, goldAmount });
      dispatch({ type: 'ADJUST_MARKET', resourceId, delta: -0.03 * qty }); // selling reduces price
      dispatch({ type: 'ADD_SKILL_XP', skill: 'commerce', amount: qty });
      return goldAmount;
    },
    [state.inventory, state.marketPrices],
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
      lastSaved: Date.now(),
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
      getInventoryQty,
      canCraftRecipe,
      getAvailableRecipes,
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
      addGold,
      spendGold,
      addPlayerXP,
      addSkillXP,
      collectFromRegion,
      unlockRegion,
      addExploration,
      saveGame,
      resetGame,
      allTalents: ALL_TALENTS,
      allForgeUpgrades: ALL_FORGE_UPGRADES,
      forgeUpgrades: state.forgeUpgrades,
      upgradeForgeElement,
      unlockTalent,
      getTalentBonus,
      // Forge history
      forgeHistory: state.forgeHistory,
      // Cloud sync
      cloudSyncStatus,
      lastCloudSync,
      syncToCloud,
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
