import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type {
  CraftOrder,
  GemData,
  InventoryItem,
  Item,
  ItemCategory,
  ItemStats,
  Player,
  Quality,
  Rarity,
  RecipeData,
  RegionData,
  ResourceData,
  SaveData,
  SkillData,
  SkillType,
} from '@/types/game';

// ---------------------------------------------------------------------------
// Static data (loaded once)
// ---------------------------------------------------------------------------
const ALL_RESOURCES: ResourceData[] = require('@/data/resources.json');
const ALL_RECIPES: RecipeData[] = require('@/data/recipes.json');
const ALL_REGIONS: RegionData[] = require('@/data/regions.json');
const ALL_SKILLS: SkillData[] = require('@/data/skills.json');
const ALL_GEMS: GemData[] = require('@/data/gems.json');

/** Maximum inventory weight (kg) based on player level */
const MAX_WEIGHT_BASE = 100;
const MAX_WEIGHT_PER_LEVEL = 5;

const SAVE_KEY = '@fk_save_v1';
const SAVE_VERSION = 1;

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
interface GameState {
  isLoaded: boolean;
  player: Player;
  inventory: InventoryItem[];
  craftedItems: Item[];
  activeOrders: CraftOrder[];
  completedQuestIds: string[];
  unlockedRegions: string[];
  regionExploration: Record<string, number>;
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
  | { type: 'REMOVE_GEM'; itemInstanceId: string; slotIndex: number };

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
    totalItemsCrafted: 0,
    totalGoldEarned: 150,
    totalPlayTime: 0,
    createdAt: Date.now(),
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
    unlockedRegions: ['village'],
    regionExploration: { village: 0 },
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
  if (skillXP[skill] >= threshold && skills[skill] < 100) {
    skillXP[skill] -= threshold;
    skills[skill] = (skills[skill] ?? 1) + 1;
    // Forge skill drives forge level
    if (skill === 'forge') {
      const newForgeLevel = Math.min(10, Math.floor(skills['forge'] / 10) + 1);
      return { ...player, skillXP, skills, forgeLevel: newForgeLevel };
    }
  }
  return { ...player, skillXP, skills };
}

function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'LOAD': {
      const s = action.payload;
      return {
        isLoaded: true,
        player: s.player,
        inventory: s.inventory,
        craftedItems: s.craftedItems,
        activeOrders: s.activeOrders,
        completedQuestIds: s.completedQuestIds,
        unlockedRegions: s.unlockedRegions,
        regionExploration: s.regionExploration,
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
      };
      return { ...state, craftedItems: [...state.craftedItems, action.item], player };
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
  // Static data
  allResources: ResourceData[];
  allRecipes: RecipeData[];
  allRegions: RegionData[];
  allSkills: SkillData[];
  allGems: GemData[];
  maxWeight: number;
  // Helpers
  getResourceById: (id: string) => ResourceData | undefined;
  getRecipeById: (id: string) => RecipeData | undefined;
  getInventoryQty: (resourceId: string) => number;
  canCraftRecipe: (recipeId: string) => boolean;
  getAvailableRecipes: () => RecipeData[];
  getSocketableGems: () => GemData[];
  // Actions
  addResource: (resourceId: string, qty: number) => void;
  removeResource: (resourceId: string, qty: number) => void;
  craftItem: (recipeId: string) => Item | null;
  /** Craft an item using an externally-calculated quality score (from mini-game). */
  craftItemWithScore: (recipeId: string, qualityScore: number) => Item | null;
  /** Socket a gem into an item slot; returns false if not possible. */
  socketGem: (itemInstanceId: string, slotIndex: number, gem: GemData) => boolean;
  /** Remove gem from slot and return it to inventory. */
  removeGem: (itemInstanceId: string, slotIndex: number) => void;
  addGold: (amount: number) => void;
  spendGold: (amount: number) => boolean;
  addPlayerXP: (amount: number) => void;
  addSkillXP: (skill: SkillType, amount: number) => void;
  collectFromRegion: (regionId: string) => { resourceId: string; quantity: number }[];
  unlockRegion: (regionId: string) => void;
  /** Increment exploration % for a region (capped at 100). */
  addExploration: (regionId: string, gain: number) => void;
  saveGame: () => Promise<void>;
  resetGame: () => void;
}

const GameContext = createContext<GameContextType | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------
export function GameProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(gameReducer, buildInitialState());
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load saved game on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SAVE_KEY);
        if (raw) {
          const data: SaveData = JSON.parse(raw);
          if (data.version === SAVE_VERSION) {
            dispatch({ type: 'LOAD', payload: data });
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
          unlockedRegions: state.unlockedRegions,
          regionExploration: state.regionExploration,
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

      // Reward harvest XP
      if (drops.length > 0) {
        dispatch({ type: 'ADD_SKILL_XP', skill: 'harvest', amount: drops.length * 3 });
        dispatch({ type: 'ADD_PLAYER_XP', amount: drops.length * 2 });
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
    () => MAX_WEIGHT_BASE + state.player.level * MAX_WEIGHT_PER_LEVEL,
    [state.player.level],
  );

  const saveGame = useCallback(async () => {
    const save: SaveData = {
      version: SAVE_VERSION,
      player: state.player,
      inventory: state.inventory,
      craftedItems: state.craftedItems,
      activeOrders: state.activeOrders,
      completedQuestIds: state.completedQuestIds,
      unlockedRegions: state.unlockedRegions,
      regionExploration: state.regionExploration,
      lastSaved: Date.now(),
    };
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(save));
  }, [state]);

  const resetGame = useCallback(() => {
    dispatch({ type: 'RESET' });
    AsyncStorage.removeItem(SAVE_KEY).catch(() => {});
  }, []);

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
      allResources: ALL_RESOURCES,
      allRecipes: ALL_RECIPES,
      allRegions: ALL_REGIONS,
      allSkills: ALL_SKILLS,
      allGems: ALL_GEMS,
      maxWeight,
      getResourceById,
      getRecipeById,
      getInventoryQty,
      canCraftRecipe,
      getAvailableRecipes,
      getSocketableGems,
      addResource,
      removeResource,
      craftItem,
      craftItemWithScore,
      socketGem,
      removeGem,
      addGold,
      spendGold,
      addPlayerXP,
      addSkillXP,
      collectFromRegion,
      unlockRegion,
      addExploration,
      saveGame,
      resetGame,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state],
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
