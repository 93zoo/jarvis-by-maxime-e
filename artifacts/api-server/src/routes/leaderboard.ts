import { Router, type Request } from "express";
import crypto from "node:crypto";
import {
  db,
  leaderboardEntriesTable,
  leaderboardAwardsTable,
  leaderboardSettledTable,
  type LeaderboardEntry,
  type LeaderboardAward,
} from "@workspace/db";
import { and, eq, lt, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

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
  entry: LeaderboardEntry | undefined,
  token: string,
  opts: { allowMissingEntry?: boolean } = {},
): boolean {
  if (!token) return false;
  if (!entry) return opts.allowMissingEntry === true;
  if (!entry.token) return false;
  return tokensMatch(entry.token, token);
}

// ── Rewards for daily/weekly top 3 ───────────────────────────────────────────

interface AwardMaterial {
  id: string;
  qty: number;
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

function rankTop3(
  entries: LeaderboardEntry[],
  dayKeys: string[],
): { playerId: string; name: string; points: number }[] {
  return entries
    // Only token-bound entries are eligible for rewards: awards for entries
    // nobody can prove ownership of would be stealable via first-come binding.
    .filter((e) => e.token)
    .map((e) => ({
      playerId: e.playerId,
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
 * Idempotent and safe across concurrent instances: the settled marker is
 * claimed with an INSERT that only one transaction can win.
 */
async function settleFinishedPeriods(): Promise<void> {
  const now = new Date();

  const candidates: { period: "daily" | "weekly"; periodKey: string; dayKeys: string[] }[] = [];

  // Daily: settle yesterday (UTC) once today has started.
  const yesterday = dayKey(new Date(now.getTime() - 86_400_000));
  candidates.push({ period: "daily", periodKey: yesterday, dayKeys: [yesterday] });

  // Weekly: settle the previous ISO week once a new week has started.
  const lastWeek = weekKey(new Date(now.getTime() - 7 * 86_400_000));
  if (lastWeek !== weekKey(now)) {
    const keys: string[] = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date(now.getTime() - i * 86_400_000);
      if (weekKey(d) === lastWeek) keys.push(dayKey(d));
    }
    candidates.push({ period: "weekly", periodKey: lastWeek, dayKeys: keys });
  }

  for (const c of candidates) {
    await db.transaction(async (tx) => {
      // Claim the settlement marker; if another instance already settled this
      // period, the insert affects no rows and we skip award creation.
      const claimed = await tx
        .insert(leaderboardSettledTable)
        .values({ period: c.period, periodKey: c.periodKey })
        .onConflictDoNothing()
        .returning({ periodKey: leaderboardSettledTable.periodKey });
      if (claimed.length === 0) return;

      const entries = await tx.select().from(leaderboardEntriesTable);
      const top = rankTop3(entries, c.dayKeys);
      if (top.length > 0) {
        await tx
          .insert(leaderboardAwardsTable)
          .values(
            top.map((r, i) => {
              const reward = REWARD_TABLE[c.period][i];
              return {
                id: `${c.period}:${c.periodKey}:${i + 1}`,
                playerId: r.playerId,
                name: r.name,
                period: c.period,
                periodKey: c.periodKey,
                rank: i + 1,
                gold: reward.gold,
                materials: reward.materials,
                title: reward.title,
                claimed: false,
                createdAt: now,
              };
            }),
          )
          .onConflictDoNothing();
      }

      // Housekeeping: drop claimed awards older than 30 days.
      const cutoff = new Date(now.getTime() - 30 * 86_400_000);
      await tx
        .delete(leaderboardAwardsTable)
        .where(and(eq(leaderboardAwardsTable.claimed, true), lt(leaderboardAwardsTable.createdAt, cutoff)));
    });
  }
}

/** Latest title won by each player (most recent award wins, weekly beats daily on ties). */
function latestTitles(awards: LeaderboardAward[]): Record<string, string> {
  const titles: Record<string, string> = {};
  const sorted = [...awards].sort((a, b) => {
    const t = a.createdAt.getTime() - b.createdAt.getTime();
    if (t !== 0) return t;
    return a.period === "weekly" ? 1 : -1; // weekly last => wins
  });
  for (const a of sorted) titles[a.playerId] = a.title;
  return titles;
}

// ── POST /api/leaderboard/report ─────────────────────────────────────────────
// Body: { playerId, name, level, totalXP }
// totalXP is a lifetime cumulative counter; the server banks the positive delta
// into today's bucket. Idempotent for repeated identical reports.
router.post("/leaderboard/report", async (req, res) => {
  try {
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
    if (!token) {
      res.status(403).json({ error: "Player token required" });
      return;
    }

    const banked = await db.transaction(async (tx) => {
      // Lock the row so concurrent reports for the same player serialize.
      const [locked] = await tx
        .select()
        .from(leaderboardEntriesTable)
        .where(eq(leaderboardEntriesTable.playerId, safeId))
        .for("update")
        .limit(1);
      let prev: LeaderboardEntry | undefined = locked;
      // Legacy entry without a bound token: nobody can prove ownership, so
      // re-anchor it as a fresh identity — bind the caller's token but wipe
      // banked points. Hijacking such an entry therefore yields nothing.
      const rebindingLegacy = prev !== undefined && !prev.token;
      if (rebindingLegacy) prev = undefined;
      if (!rebindingLegacy && !authenticateOwner(prev, token, { allowMissingEntry: true })) {
        return null; // signals 403
      }
      const today = dayKey(new Date());
      // First report (or counter reset after game reset): start fresh, no banked points.
      // Clamp per-report gains to blunt trivial spoofing (client is untrusted;
      // a real anti-cheat needs authenticated identities — tracked separately).
      const MAX_DELTA_PER_REPORT = 20_000;
      const delta = prev ? Math.min(MAX_DELTA_PER_REPORT, Math.max(0, total - prev.lastTotal)) : 0;
      let days: Record<string, number> = { ...(prev?.days ?? {}) };
      if (delta > 0) days[today] = (days[today] ?? 0) + delta;
      // Prune buckets older than 8 days to keep the row small.
      const keep = new Set(periodKeys("weekly").concat(dayKey(new Date(Date.now() - 7 * 86_400_000))));
      days = Object.fromEntries(Object.entries(days).filter(([k]) => keep.has(k)));

      const entry = {
        playerId: safeId,
        name: String(name ?? prev?.name ?? "Forgeron").slice(0, 24) || "Forgeron",
        level: Number.isFinite(Number(level)) ? Math.max(1, Math.floor(Number(level))) : prev?.level ?? 1,
        lastTotal: total,
        days,
        updatedAt: new Date(),
        // Verified above (or freshly bound for a new/re-anchored identity).
        token: prev?.token ?? token,
      };
      await tx
        .insert(leaderboardEntriesTable)
        .values(entry)
        .onConflictDoUpdate({
          target: leaderboardEntriesTable.playerId,
          set: {
            name: entry.name,
            level: entry.level,
            lastTotal: entry.lastTotal,
            days: entry.days,
            updatedAt: entry.updatedAt,
            token: entry.token,
          },
        });
      return delta;
    });

    if (banked === null) {
      res.status(403).json({ error: "Invalid player token" });
      return;
    }
    res.json({ success: true, banked });
  } catch (err) {
    logger.error(err, "leaderboard report error");
    if (!res.headersSent) res.status(500).json({ error: "Failed to record score" });
  }
});

// ── GET /api/leaderboard?period=daily|weekly&playerId=... ────────────────────
// Returns the top 50 by points in the period, plus the caller's own rank.
router.get("/leaderboard", async (req, res) => {
  try {
    const period = req.query.period === "weekly" ? "weekly" : "daily";
    const selfId = sanitizeId(req.query.playerId);
    const keys = periodKeys(period);
    await settleFinishedPeriods().catch((err) => {
      logger.error(err, "leaderboard settle error");
    });
    const entries = await db.select().from(leaderboardEntriesTable);
    const titles = latestTitles(await db.select().from(leaderboardAwardsTable));

    const rows = entries
      .map((e) => ({
        playerId: e.playerId,
        name: e.name,
        level: e.level,
        title: titles[e.playerId] ?? null,
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
    await settleFinishedPeriods();
    // No entry yet (player never reported a score): nothing to steal —
    // allow reading the (necessarily empty) reward list.
    const [entry] = await db
      .select()
      .from(leaderboardEntriesTable)
      .where(eq(leaderboardEntriesTable.playerId, selfId))
      .limit(1);
    if (!authenticateOwner(entry, token, { allowMissingEntry: true })) {
      res.status(403).json({ error: "Invalid player token" });
      return;
    }
    const awards = await db.select().from(leaderboardAwardsTable);
    const playerAwards = awards.filter((a) => a.playerId === selfId);
    const pending = playerAwards.filter((a) => !a.claimed);
    const title = latestTitles(awards)[selfId] ?? null;
    // Full history (newest first) so the client can display a titles earned list.
    const history = [...playerAwards]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((a) => ({ ...a, createdAt: a.createdAt.toISOString() }));
    res.json({
      success: true,
      pending: pending.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
      title,
      history,
    });
  } catch (err) {
    logger.error(err, "leaderboard rewards read error");
    res.status(500).json({ error: "Failed to load rewards" });
  }
});

// ── POST /api/leaderboard/rewards/claim ──────────────────────────────────────
// Body: { playerId, awardId }. Marks the award claimed exactly once and
// returns its contents so the client can grant gold/materials in-game.
router.post("/leaderboard/rewards/claim", async (req, res) => {
  try {
    const { playerId, awardId } = req.body as { playerId?: string; awardId?: string };
    const selfId = sanitizeId(playerId);
    const id = String(awardId ?? "").slice(0, 64);
    const token = tokenFrom(req);
    if (!selfId || !id) {
      res.status(400).json({ error: "playerId and awardId are required" });
      return;
    }

    const outcome = await db.transaction(async (tx) => {
      // Authorization: the caller must hold the secret bound to the award
      // owner's leaderboard entry — knowing a playerId/awardId is not enough.
      const [award] = await tx
        .select()
        .from(leaderboardAwardsTable)
        .where(and(eq(leaderboardAwardsTable.id, id), eq(leaderboardAwardsTable.playerId, selfId)))
        .for("update")
        .limit(1);
      if (!award) return { status: 404 as const };
      // A claim always targets an existing winner: strict token match required
      // (awards are only ever settled for token-bound entries).
      const [entry] = await tx
        .select()
        .from(leaderboardEntriesTable)
        .where(eq(leaderboardEntriesTable.playerId, award.playerId))
        .limit(1);
      if (!authenticateOwner(entry, token)) return { status: 403 as const };
      if (award.claimed) {
        // Idempotent for the rightful owner: repeating the claim returns the
        // same payload (the client credits at most once via its own state).
        return { status: 200 as const, award, alreadyClaimed: true };
      }
      await tx
        .update(leaderboardAwardsTable)
        .set({ claimed: true })
        .where(eq(leaderboardAwardsTable.id, award.id));
      return { status: 200 as const, award: { ...award, claimed: true }, alreadyClaimed: false };
    });

    if (outcome.status === 404) {
      res.status(404).json({ error: "Award not found" });
      return;
    }
    if (outcome.status === 403) {
      res.status(403).json({ error: "Invalid player token" });
      return;
    }
    const reward = { ...outcome.award, createdAt: outcome.award.createdAt.toISOString() };
    res.json(
      outcome.alreadyClaimed
        ? { success: true, reward, alreadyClaimed: true }
        : { success: true, reward },
    );
  } catch (err) {
    logger.error(err, "leaderboard reward claim error");
    if (!res.headersSent) res.status(500).json({ error: "Failed to claim reward" });
  }
});

export default router;
