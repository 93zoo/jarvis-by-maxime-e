import { Router } from "express";
import fs from "node:fs/promises";
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
  if (!safeId || !Number.isFinite(total) || total < 0) {
    res.status(400).json({ error: "playerId and a non-negative totalXP are required" });
    return;
  }

  writeChain = writeChain
    .then(async () => {
      const data = await readData();
      const today = dayKey(new Date());
      const prev = data[safeId];
      // First report (or counter reset after game reset): start fresh, no banked points.
      const delta = prev ? Math.max(0, total - prev.lastTotal) : 0;
      const days = { ...(prev?.days ?? {}) };
      if (delta > 0) days[today] = (days[today] ?? 0) + delta;
      // Counter went backwards => player reset their game; re-anchor.
      const entry: PlayerEntry = {
        name: String(name ?? prev?.name ?? "Forgeron").slice(0, 24) || "Forgeron",
        level: Number.isFinite(Number(level)) ? Math.max(1, Math.floor(Number(level))) : prev?.level ?? 1,
        lastTotal: total,
        days,
        updatedAt: new Date().toISOString(),
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
    const data = await readData();

    const rows = Object.entries(data)
      .map(([id, e]) => ({
        playerId: id,
        name: e.name,
        level: e.level,
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

export default router;
