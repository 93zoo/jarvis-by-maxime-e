/**
 * Client du classement des joueurs (jour / semaine).
 *
 * Points = XP forgeron (niveau du joueur) + XP de forge gagnés sur la période.
 * Le client envoie un compteur cumulatif (`totalXP`) ; le serveur calcule le
 * gain du jour ("delta") et le classe par jour et par semaine.
 *
 * Sur web, l'API vit sur `window.location.origin + '/api-server/api'`.
 * Sur natif sans backend accessible, la fonctionnalité est désactivée
 * proprement (les écrans affichent un état "hors ligne").
 */
import { Platform } from 'react-native';

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  level: number;
  points: number;
  rank: number;
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
    await fetch(`${base}/leaderboard/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  } catch {
    // best effort — le prochain rapport rattrapera le delta
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
