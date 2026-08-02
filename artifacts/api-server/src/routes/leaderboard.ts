import { Router, type Request } from "express";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { logger } from "../lib/logger";

const router = Router();

// Leaderboard data lives next to the cloud saves.
const DATA_DIR = path.join(process.cwd(), ".saves");
const LB_FILE = path.join(DATA_DIR, "leaderboard.json");

interface PlayerEntry {
  name: string;
  level: number;
  /** Last cumulative counter reported by the client (player XP earned + forge XP earned). */
  lastTotal: number;
  /** Points gained per day, keyed by "YYYY-MM-DD" (UTC). */
  days: Record<string, number>;
  updatedAt: string;
  /**
   * Secret bound to this playerId on first authenticated report (trust on
   * first use). Required afterwards to report scores or claim rewards.
   */
  token?: string;
}

type LeaderboardData = Record<string, PlayerEntry>;

// Serialize writes so concurrent reports never clobber each other.
let writeChain: Promise<void> = Promise.resolve();

async function readData(): Promise<LeaderboardData> {
  try {
    const raw = await fs.readFile(LB_FILE, "utf-8");
    return JSON.parse(raw) as LeaderboardData;
  } catch {
    return {};
  }
}

async function writeData(data: LeaderboardData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${LB_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data), "utf-8");
  await fs.rename(tmp, LB_FILE);
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Day keys for the requested period (UTC): today only, or the last 7 days. */
function periodKeys(period: string): string[] {
  const days = period === "weekly" ? 7 : 1;
  const keys: string[] = [];
  const now = Date.now();
  for (let i = 0; i < days; i++) {
    keys.push(dayKey(new Date(now - i * 86_400_000)));
  }
  return keys;
}

function sanitizeId(id: unknown): string {
  return String(id ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

/** Caller secret sent by the client in the `x-player-token` header. */
function tokenFrom(req: Request): string {
  return String(req.header("x-player-token") ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
}

function tokensMatch(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/**
 * Authenticate the caller as the owner of `playerId`.
 *
 * Rules:
 * - A non-empty token is always required.
 * - The entry's stored token must match exactly.
 * - Entries without a token (predating token support) are never considered
 *   owned by anyone: they are ineligible for rewards, and reporting a score
 *   for them re-anchors the identity with a fresh start (see the report
 *   route), so there is nothing an attacker can bind to or steal.
 * - `allowMissingEntry` covers players who never reported a score (there is
 *   nothing protected to read for them).
 */
function authenticateOwner(
  entry: PlayerEntry | undefined,
  token: string,
  opts: { allowMissingEntry?: boolean } = {},
): boolean {
  if (!token) return false;
  if (!entry) return opts.allowMissingEntry === true;
  if (!entry.token) return false;
  return tokensMatch(entry.token, token);
}

// ── Rewards for daily/weekly top 3 ───────────────────────────────────────────

const AWARDS_FILE = path.join(DATA_DIR, "leaderboard-awards.json");

interface AwardMaterial {
  id: string;
  qty: number;
}

interface Award {
  id: string;
  playerId: string;
  name: string;
  period: "daily" | "weekly";
  /** "YYYY-MM-DD" for daily, "YYYY-Www" for weekly. */
  periodKey: string;
  rank: number;
  gold: number;
  materials: AwardMaterial[];
  title: string;
  claimed: boolean;
  createdAt: string;
}

interface AwardsData {
  settled: { daily: string[]; weekly: string[] };
  awards: Award[];
}

const REWARD_TABLE: Record<"daily" | "weekly", { gold: number; materials: AwardMaterial[]; title: string }[]> = {
  daily: [
    { gold: 500, materials: [{ id: "crystal", qty: 2 }], title: "Champion du jour" },
    { gold: 300, materials: [{ id: "crystal", qty: 1 }], title: "Rival du jour" },
    { gold: 150, materials: [{ id: "ruby", qty: 1 }], title: "Étoile du jour" },
  ],
  weekly: [
    { gold: 2000, materials: [{ id: "dragon_scale", qty: 2 }, { id: "diamond", qty: 1 }], title: "Champion de la forge" },
    { gold: 1200, materials: [{ id: "diamond", qty: 1 }], title: "Maître de la semaine" },
    { gold: 700, materials: [{ id: "ruby", qty: 2 }], title: "Prodige de la semaine" },
  ],
};

async function readAwards(): Promise<AwardsData> {
  try {
    const raw = await fs.readFile(AWARDS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<AwardsData>;
    return {
      settled: { daily: parsed.settled?.daily ?? [], weekly: parsed.settled?.weekly ?? [] },
      awards: parsed.awards ?? [],
    };
  } catch {
    return { settled: { daily: [], weekly: [] }, awards: [] };
  }
}

async function writeAwards(data: AwardsData): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${AWARDS_FILE}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data), "utf-8");
  await fs.rename(tmp, AWARDS_FILE);
}

/** ISO week key, e.g. "2026-W31" (weeks run Monday–Sunday, UTC). */
function weekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Shift to the Thursday of this ISO week to determine the week-year.
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function rankTop3(data: LeaderboardData, dayKeys: string[]): { playerId: string; name: string; points: number }[] {
  return Object.entries(data)
    // Only token-bound entries are eligible for rewards: awards for entries
    // nobody can prove ownership of would be stealable via first-come binding.
    .filter(([, e]) => e.token)
    .map(([id, e]) => ({
      playerId: id,
      name: e.name,
      points: dayKeys.reduce((sum, k) => sum + (e.days[k] ?? 0), 0),
    }))
    .filter((r) => r.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);
}

/**
 * Lazily settle any finished periods (yesterday's daily race, last ISO week's
 * weekly race). Creates claimable awards for the top 3 of each finished period.
 * Runs inside the write chain; idempotent thanks to the `settled` markers.
 */
async function settleFinishedPeriods(): Promise<void> {
  const data = await readData();
  const awards = await readAwards();
  const now = new Date();
  let dirty = false;

  // Daily: settle yesterday (UTC) once today has started.
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
  if (!awards.settled.daily.includes(yesterday)) {
    const top = rankTop3(data, [yesterday]);
    top.forEach((r, i) => {
      const reward = REWARD_TABLE.daily[i];
      awards.awards.push({
        id: `daily:${yesterday}:${i + 1}`,
        playerId: r.playerId,
        name: r.name,
        period: "daily",
        periodKey: yesterday,
        rank: i + 1,
        gold: reward.gold,
        materials: reward.materials,
        title: reward.title,
        claimed: false,
        createdAt: now.toISOString(),
      });
    });
    awards.settled.daily.push(yesterday);
    dirty = true;
  }

  // Weekly: settle the previous ISO week once a new week has started.
  const lastWeek = weekKey(new Date(now.getTime() - 7 * 86_400_000));
  if (lastWeek !== weekKey(now) && !awards.settled.weekly.includes(lastWeek)) {
    // Collect the day keys of the previous ISO week from the last 14 days.
    const keys: string[] = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date(now.getTime() - i * 86_400_000);
      if (weekKey(d) === lastWeek) keys.push(dayKey(d));
    }
    const top = rankTop3(data, keys);
    top.forEach((r, i) => {
      const reward = REWARD_TABLE.weekly[i];
      awards.awards.push({
        id: `weekly:${lastWeek}:${i + 1}`,
        playerId: r.playerId,
        name: r.name,
        period: "weekly",
        periodKey: lastWeek,
        rank: i + 1,
        gold: reward.gold,
        materials: reward.materials,
        title: reward.title,
        claimed: false,
        createdAt: now.toISOString(),
      });
    });
    awards.settled.weekly.push(lastWeek);
    dirty = true;
  }

  if (dirty) {
    // Keep the file small: cap the settled markers and drop claimed awards older than 30 days.
    awards.settled.daily = awards.settled.daily.slice(-30);
    awards.settled.weekly = awards.settled.weekly.slice(-10);
    const cutoff = now.getTime() - 30 * 86_400_000;
    awards.awards = awards.awards.filter((a) => !a.claimed || Date.parse(a.createdAt) > cutoff);
    await writeAwards(awards);
  }
}

/** Latest title won by each player (most recent award wins, weekly beats daily on ties). */
function latestTitles(awards: Award[]): Record<string, string> {
  const titles: Record<string, string> = {};
  const sorted = [...awards].sort((a, b) => {
    const t = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    if (t !== 0) return t;
    return a.period === "weekly" ? 1 : -1; // weekly last => wins
  });
  for (const a of sorted) titles[a.playerId] = a.title;
  return titles;
}

/** Run a job serialized on the write chain and get its result. */
function onWriteChain<T>(job: () => Promise<T>): Promise<T> {
  const result = writeChain.then(job);
  writeChain = result.then(() => undefined, () => undefined);
  return result;
}

// ── POST /api/leaderboard/report ─────────────────────────────────────────────
// Body: { playerId, name, level, totalXP }
// totalXP is a lifetime cumulative counter; the server banks the positive delta
// into today's bucket. Idempotent for repeated identical reports.
router.post("/leaderboard/report", (req, res) => {
  const { playerId, name, level, totalXP } = req.body as {
    playerId?: string;
    name?: string;
    level?: number;
    totalXP?: number;
  };

  const safeId = sanitizeId(playerId);
  const total = Number(totalXP);
  const token = tokenFrom(req);
  if (!safeId || !Number.isFinite(total) || total < 0) {
    res.status(400).json({ error: "playerId and a non-negative totalXP are required" });
    return;
  }

  writeChain = writeChain
    .then(async () => {
      const data = await readData();
      const today = dayKey(new Date());
      let prev = data[safeId] as PlayerEntry | undefined;
      // Legacy entry without a bound token: nobody can prove ownership, so
      // re-anchor it as a fresh identity — bind the caller's token but wipe
      // banked points. Hijacking such an entry therefore yields nothing.
      const rebindingLegacy = prev !== undefined && !prev.token;
      if (rebindingLegacy) prev = undefined;
      if (!rebindingLegacy && !authenticateOwner(prev, token, { allowMissingEntry: true })) {
        res.status(403).json({ error: "Invalid player token" });
        return;
      }
      if (!token) {
        res.status(403).json({ error: "Player token required" });
        return;
      }
      // First report (or counter reset after game reset): start fresh, no banked points.
      // Clamp per-report gains to blunt trivial spoofing (client is untrusted;
      // a real anti-cheat needs authenticated identities — tracked separately).
      const MAX_DELTA_PER_REPORT = 20_000;
      const delta = prev ? Math.min(MAX_DELTA_PER_REPORT, Math.max(0, total - prev.lastTotal)) : 0;
      const days = { ...(prev?.days ?? {}) };
      if (delta > 0) days[today] = (days[today] ?? 0) + delta;
      // Counter went backwards => player reset their game; re-anchor.
      const entry: PlayerEntry = {
        name: String(name ?? prev?.name ?? "Forgeron").slice(0, 24) || "Forgeron",
        level: Number.isFinite(Number(level)) ? Math.max(1, Math.floor(Number(level))) : prev?.level ?? 1,
        lastTotal: total,
        days,
        updatedAt: new Date().toISOString(),
        // Verified above (or freshly bound for a new/re-anchored identity).
        token: prev?.token ?? token,
      };
      // Prune buckets older than 8 days to keep the file small.
      const keep = new Set(periodKeys("weekly").concat(dayKey(new Date(Date.now() - 7 * 86_400_000))));
      entry.days = Object.fromEntries(Object.entries(entry.days).filter(([k]) => keep.has(k)));
      data[safeId] = entry;
      await writeData(data);
      res.json({ success: true, banked: delta });
    })
    .catch((err) => {
      logger.error(err, "leaderboard report error");
      if (!res.headersSent) res.status(500).json({ error: "Failed to record score" });
    });
});

// ── GET /api/leaderboard?period=daily|weekly&playerId=... ────────────────────
// Returns the top 50 by points in the period, plus the caller's own rank.
router.get("/leaderboard", async (req, res) => {
  try {
    const period = req.query.period === "weekly" ? "weekly" : "daily";
    const selfId = sanitizeId(req.query.playerId);
    const keys = periodKeys(period);
    await onWriteChain(() => settleFinishedPeriods()).catch((err) => {
      logger.error(err, "leaderboard settle error");
    });
    const data = await readData();
    const titles = latestTitles((await readAwards()).awards);

    const rows = Object.entries(data)
      .map(([id, e]) => ({
        playerId: id,
        name: e.name,
        level: e.level,
        title: titles[id] ?? null,
        points: keys.reduce((sum, k) => sum + (e.days[k] ?? 0), 0),
      }))
      .filter((r) => r.points > 0)
      .sort((a, b) => b.points - a.points);

    const top = rows.slice(0, 50).map((r, i) => ({ ...r, rank: i + 1 }));
    const selfIdx = selfId ? rows.findIndex((r) => r.playerId === selfId) : -1;
    const self = selfIdx >= 0 ? { ...rows[selfIdx], rank: selfIdx + 1 } : null;

    res.json({ success: true, period, entries: top, self, totalPlayers: rows.length });
  } catch (err) {
    logger.error(err, "leaderboard read error");
    res.status(500).json({ error: "Failed to load leaderboard" });
  }
});

// ── GET /api/leaderboard/rewards?playerId=... ────────────────────────────────
// Returns the caller's unclaimed awards (settling finished periods first) and
// their current display title.
router.get("/leaderboard/rewards", async (req, res) => {
  try {
    const selfId = sanitizeId(req.query.playerId);
    if (!selfId) {
      res.status(400).json({ error: "playerId is required" });
      return;
    }
    const token = tokenFrom(req);
    await onWriteChain(() => settleFinishedPeriods());
    // No entry yet (player never reported a score): nothing to steal —
    // allow reading the (necessarily empty) reward list.
    const entry = (await readData())[selfId];
    if (!authenticateOwner(entry, token, { allowMissingEntry: true })) {
      res.status(403).json({ error: "Invalid player token" });
      return;
    }
    const awards = await readAwards();
    const pending = awards.awards.filter((a) => a.playerId === selfId && !a.claimed);
    const title = latestTitles(awards.awards)[selfId] ?? null;
    res.json({ success: true, pending, title });
  } catch (err) {
    logger.error(err, "leaderboard rewards read error");
    res.status(500).json({ error: "Failed to load rewards" });
  }
});

// ── POST /api/leaderboard/rewards/claim ──────────────────────────────────────
// Body: { playerId, awardId }. Marks the award claimed exactly once and
// returns its contents so the client can grant gold/materials in-game.
router.post("/leaderboard/rewards/claim", (req, res) => {
  const { playerId, awardId } = req.body as { playerId?: string; awardId?: string };
  const selfId = sanitizeId(playerId);
  const id = String(awardId ?? "").slice(0, 64);
  const token = tokenFrom(req);
  if (!selfId || !id) {
    res.status(400).json({ error: "playerId and awardId are required" });
    return;
  }
  onWriteChain(async () => {
    // Authorization: the caller must hold the secret bound to the award
    // owner's leaderboard entry — knowing a playerId/awardId is not enough.
    const awards = await readAwards();
    const award = awards.awards.find((a) => a.id === id && a.playerId === selfId);
    if (!award) {
      res.status(404).json({ error: "Award not found" });
      return;
    }
    // A claim always targets an existing winner: strict token match required
    // (awards are only ever settled for token-bound entries).
    if (!authenticateOwner((await readData())[award.playerId], token)) {
      res.status(403).json({ error: "Invalid player token" });
      return;
    }
    if (award.claimed) {
      // Idempotent for the rightful owner: repeating the claim returns the
      // same payload (the client credits at most once via its own state).
      res.json({ success: true, reward: award, alreadyClaimed: true });
      return;
    }
    award.claimed = true;
    await writeAwards(awards);
    res.json({ success: true, reward: award });
  }).catch((err) => {
    logger.error(err, "leaderboard reward claim error");
    if (!res.headersSent) res.status(500).json({ error: "Failed to claim reward" });
  });
});

export default router;
