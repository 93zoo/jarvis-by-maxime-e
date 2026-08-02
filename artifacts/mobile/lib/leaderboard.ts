/**
 * Client du classement des joueurs (jour / semaine).
 *
 * Points = XP forgeron (niveau du joueur) + XP de forge gagnés sur la période.
 * Le client envoie un compteur cumulatif (`totalXP`) ; le serveur calcule le
 * gain du jour ("delta") et le classe par jour et par semaine.
 *
 * Sur web, l'API vit sur `window.location.origin + '/api-server/api'`.
 * Sur natif en développement (Expo Go), on passe par le domaine qui sert le
 * bundle (Constants.expoConfig.hostUri) : le proxy Metro y expose
 * `/api-server/*`. Sur natif en production (build EAS/store), il n'y a pas de
 * Metro : l'URL vient de EXPO_PUBLIC_API_URL (inlinée au build, voir eas.json).
 * Si aucune adresse n'est trouvable, la fonctionnalité est désactivée
 * proprement (les écrans affichent un état "hors ligne").
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PLAYER_TOKEN_KEY = '@fk_player_secret';

/**
 * Secret propre à cet appareil, lié au playerId côté serveur au premier
 * rapport (trust on first use). Sans lui, impossible de signaler un score
 * ou de réclamer une récompense au nom de ce joueur.
 */
async function getPlayerToken(): Promise<string> {
  try {
    let token = await AsyncStorage.getItem(PLAYER_TOKEN_KEY);
    if (!token) {
      const rand = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
      token = `tk_${rand()}${rand()}${rand()}`.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      await AsyncStorage.setItem(PLAYER_TOKEN_KEY, token);
    }
    return token;
  } catch {
    return '';
  }
}

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  level: number;
  points: number;
  rank: number;
  /** Titre gagné au classement (ex. « Champion de la forge »), s'il y en a un. */
  title?: string | null;
}

export interface LeaderboardAward {
  id: string;
  playerId: string;
  name: string;
  period: 'daily' | 'weekly';
  periodKey: string;
  rank: number;
  gold: number;
  materials: { id: string; qty: number }[];
  title: string;
  claimed: boolean;
  createdAt: string;
}

export interface LeaderboardResult {
  period: 'daily' | 'weekly';
  entries: LeaderboardEntry[];
  self: LeaderboardEntry | null;
  totalPlayers: number;
}

export function getLeaderboardApiBase(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api-server/api`;
  }
  // Natif en développement : le bundle est servi par Metro, dont le proxy
  // expose aussi /api-server/*.
  const hostUri: string | undefined = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split('/')[0]; // ex. "xxx.replit.dev:443" ou "192.168.x.x:8081"
    const isLocal = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    return `${isLocal ? 'http' : 'https'}://${host.replace(/:443$/, '')}/api-server/api`;
  }
  // Natif en production (build EAS/store) : pas de Metro ni de hostUri.
  // L'URL vient d'une config explicite, inlinée au moment du build :
  // EXPO_PUBLIC_API_URL = URL publiée de l'api-server, ex.
  // "https://<app>.replit.app/api" (voir eas.json, section build.*.env).
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) {
    return envUrl.replace(/\/+$/, '');
  }
  return '';
}

export function isLeaderboardAvailable(): boolean {
  return getLeaderboardApiBase() !== '';
}

/** Envoie le score cumulé du joueur. Silencieux en cas d'échec (best effort). */
export async function reportLeaderboardScore(params: {
  playerId: string;
  name: string;
  level: number;
  totalXP: number;
}): Promise<void> {
  const base = getLeaderboardApiBase();
  if (!base || !params.playerId) return;
  try {
    const token = await getPlayerToken();
    await fetch(`${base}/leaderboard/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-player-token': token },
      body: JSON.stringify(params),
    });
  } catch {
    // best effort — le prochain rapport rattrapera le delta
  }
}

/** Récupère les récompenses du joueur (en attente + historique complet). Silencieux en cas d'échec. */
export async function fetchLeaderboardRewards(
  playerId: string,
): Promise<{ pending: LeaderboardAward[]; title: string | null; history: LeaderboardAward[] }> {
  const base = getLeaderboardApiBase();
  if (!base || !playerId) return { pending: [], title: null, history: [] };
  try {
    const token = await getPlayerToken();
    const res = await fetch(`${base}/leaderboard/rewards?playerId=${encodeURIComponent(playerId)}`, {
      headers: { 'x-player-token': token },
    });
    if (!res.ok) return { pending: [], title: null, history: [] };
    const json = await res.json();
    return { pending: json.pending ?? [], title: json.title ?? null, history: json.history ?? [] };
  } catch {
    return { pending: [], title: null, history: [] };
  }
}

/**
 * Réclame une récompense. Retourne la récompense confirmée par le serveur,
 * ou null si elle a déjà été réclamée / en cas d'échec réseau.
 */
export async function claimLeaderboardReward(
  playerId: string,
  awardId: string,
): Promise<LeaderboardAward | null> {
  const base = getLeaderboardApiBase();
  if (!base || !playerId || !awardId) return null;
  try {
    const token = await getPlayerToken();
    const res = await fetch(`${base}/leaderboard/rewards/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-player-token': token },
      body: JSON.stringify({ playerId, awardId }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    // Déjà réclamée (rejouée par le même joueur) : ne pas créditer une 2e fois.
    if (json.alreadyClaimed) return null;
    return json.reward ?? null;
  } catch {
    return null;
  }
}

/** Récupère le classement pour la période donnée. Lève en cas d'échec réseau. */
export async function fetchLeaderboard(
  period: 'daily' | 'weekly',
  playerId?: string,
): Promise<LeaderboardResult> {
  const base = getLeaderboardApiBase();
  if (!base) throw new Error('leaderboard unavailable');
  const qs = new URLSearchParams({ period });
  if (playerId) qs.set('playerId', playerId);
  const res = await fetch(`${base}/leaderboard?${qs.toString()}`);
  if (!res.ok) throw new Error(`leaderboard fetch failed (${res.status})`);
  const json = await res.json();
  return {
    period: json.period,
    entries: json.entries ?? [],
    self: json.self ?? null,
    totalPlayers: json.totalPlayers ?? 0,
  };
}
