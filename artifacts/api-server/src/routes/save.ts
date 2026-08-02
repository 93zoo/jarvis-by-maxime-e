import { Router } from "express";
import { db, cloudSavesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

function sanitizeId(id: unknown): string {
  return String(id ?? "").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
}

// ── POST /api/save ────────────────────────────────────────────────────────────
// Body: { playerId: string, saveData: object, clientVersion?: number }
// Upserts the player's progress into the database.
router.post("/save", async (req, res) => {
  try {
    const { playerId, saveData, clientVersion } = req.body as {
      playerId?: string;
      saveData?: unknown;
      clientVersion?: number;
    };

    if (!playerId || !saveData) {
      res.status(400).json({ error: "playerId and saveData are required" });
      return;
    }

    const safeId = sanitizeId(playerId);
    if (!safeId) {
      res.status(400).json({ error: "invalid playerId" });
      return;
    }

    const savedAt = new Date();
    await db
      .insert(cloudSavesTable)
      .values({
        playerId: safeId,
        saveData,
        clientVersion: Number.isFinite(Number(clientVersion)) ? Math.floor(Number(clientVersion)) : 1,
        savedAt,
      })
      .onConflictDoUpdate({
        target: cloudSavesTable.playerId,
        set: {
          saveData: sql`excluded.save_data`,
          clientVersion: sql`excluded.client_version`,
          savedAt: sql`excluded.saved_at`,
        },
      });

    logger.info({ playerId: safeId }, "cloud save written");
    res.json({ success: true, savedAt: savedAt.toISOString() });
  } catch (err) {
    logger.error(err, "cloud save write error");
    res.status(500).json({ error: "Failed to save progress" });
  }
});

// ── GET /api/save/:playerId ───────────────────────────────────────────────────
// Returns the stored save for a given playerId, or 404 if none exists.
router.get("/save/:playerId", async (req, res) => {
  try {
    const safeId = sanitizeId(req.params.playerId);
    if (!safeId) {
      res.status(400).json({ error: "invalid playerId" });
      return;
    }

    const [row] = await db
      .select()
      .from(cloudSavesTable)
      .where(eq(cloudSavesTable.playerId, safeId))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "No cloud save found for this player" });
      return;
    }

    logger.info({ playerId: safeId }, "cloud save loaded");
    res.json({
      success: true,
      playerId: row.playerId,
      saveData: row.saveData,
      clientVersion: row.clientVersion,
      savedAt: row.savedAt.toISOString(),
    });
  } catch (err) {
    logger.error(err, "cloud save read error");
    res.status(500).json({ error: "Failed to load progress" });
  }
});

// ── DELETE /api/save/:playerId ────────────────────────────────────────────────
// Permanently deletes a player's cloud save.
router.delete("/save/:playerId", async (req, res) => {
  try {
    const safeId = sanitizeId(req.params.playerId);
    if (!safeId) {
      res.status(400).json({ error: "invalid playerId" });
      return;
    }

    const deleted = await db
      .delete(cloudSavesTable)
      .where(eq(cloudSavesTable.playerId, safeId))
      .returning({ playerId: cloudSavesTable.playerId });

    if (deleted.length === 0) {
      res.status(404).json({ error: "No save found to delete" });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    logger.error(err, "cloud save delete error");
    res.status(500).json({ error: "Failed to delete save" });
  }
});

export default router;
