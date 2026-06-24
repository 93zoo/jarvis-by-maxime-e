import { Router } from "express";

const router = Router();

// ── POST /api/email/send ──────────────────────────────────────────────────────
// Gmail client will be injected here once the Gmail Replit integration is connected.
// Until then this route returns a clear error so the mobile app shows feedback.
router.post("/send", async (req, res) => {
  const { to, subject, body } = req.body as {
    to?: string;
    subject?: string;
    body?: string;
  };

  if (!to?.trim() || !body?.trim()) {
    res.status(400).json({ error: "Les champs 'to' et 'body' sont requis." });
    return;
  }

  // TODO: replace this block with the Gmail connector client once connected.
  // See: artifacts/api-server/src/lib/gmail.ts (will be created after OAuth setup)
  res.status(503).json({
    error:
      "Gmail non encore configuré. Connecte ton compte Google dans les paramètres Replit.",
  });
});

export default router;
