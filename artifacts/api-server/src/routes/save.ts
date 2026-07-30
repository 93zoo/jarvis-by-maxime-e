import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "../lib/logger";

const router = Router();

// Store saves in a .saves/ directory at the project root
const SAVE_DIR = path.join(process.cwd(), ".saves");

async function ensureSaveDir() {
  try {
    await fs.mkdir(SAVE_DIR, { recursive: true });
  } catch {
    // already exists
  }
}

// ── POST /api/save ────────────────────────────────────────────────────────────
// Body: { playerId: string, saveData: object, clientVersion?: number }
// Saves the player's progress to disk.
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

    // Sanitise playerId to a safe filename (alphanumeric + dash/underscore only)
    const safeId = String(playerId).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
    if (!safeId) {
      res.status(400).json({ error: "invalid playerId" });
      return;
    }

    await ensureSaveDir();

    const payload = {
      playerId: safeId,
      saveData,
      clientVersion: clientVersion ?? 1,
      savedAt: new Date().toISOString(),
    };

    const filePath = path.join(SAVE_DIR, `${safeId}.json`);
    await fs.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");

    logger.info({ playerId: safeId }, "cloud save written");
    res.json({ success: true, savedAt: payload.savedAt });
  } catch (err) {
    logger.error(err, "cloud save write error");
    res.status(500).json({ error: "Failed to save progress" });
  }
});

// ── GET /api/save/:playerId ───────────────────────────────────────────────────
// Returns the stored save for a given playerId, or 404 if none exists.
router.get("/save/:playerId", async (req, res) => {
  try {
    const safeId = String(req.params.playerId)
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 64);

    if (!safeId) {
      res.status(400).json({ error: "invalid playerId" });
      return;
    }

    const filePath = path.join(SAVE_DIR, `${safeId}.json`);
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);

    logger.info({ playerId: safeId }, "cloud save loaded");
    res.json({ success: true, ...parsed });
  } catch {
    res.status(404).json({ error: "No cloud save found for this player" });
  }
});

// ── DELETE /api/save/:playerId ────────────────────────────────────────────────
// Permanently deletes a player's cloud save.
router.delete("/save/:playerId", async (req, res) => {
  try {
    const safeId = String(req.params.playerId)
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 64);

    if (!safeId) {
      res.status(400).json({ error: "invalid playerId" });
      return;
    }

    const filePath = path.join(SAVE_DIR, `${safeId}.json`);
    await fs.unlink(filePath);
    res.json({ success: true });
  } catch {
    res.status(404).json({ error: "No save found to delete" });
  }
});

export default router;
