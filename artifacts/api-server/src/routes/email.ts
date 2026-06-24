import { Router } from "express";
import nodemailer from "nodemailer";

const router = Router();

// ── POST /api/email/send ──────────────────────────────────────────────────────
// Credentials are provided per-request from the mobile app (stored locally
// on the user's device, never persisted server-side).
router.post("/send", async (req, res) => {
  const { from, appPassword, to, subject, body } = req.body as {
    from?: string;
    appPassword?: string;
    to?: string;
    subject?: string;
    body?: string;
  };

  if (!from?.trim() || !appPassword?.trim()) {
    res.status(400).json({ error: "Compte Gmail non configuré. Rends-toi dans Paramètres > Email pour le configurer." });
    return;
  }
  if (!to?.trim() || !body?.trim()) {
    res.status(400).json({ error: "Destinataire et corps du message requis." });
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: from.trim(), pass: appPassword.trim() },
  });

  try {
    await transporter.sendMail({
      from: `"JARVIS" <${from.trim()}>`,
      to: to.trim(),
      subject: subject?.trim() || "(sans objet)",
      text: body.trim(),
    });

    res.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erreur inconnue";
    // Give a human-readable hint for the most common error
    const hint = msg.includes("Invalid login") || msg.includes("Username and Password")
      ? "Mot de passe d'application invalide. Génère-en un sur myaccount.google.com > Sécurité > Mots de passe des applications."
      : msg;
    res.status(500).json({ error: hint });
  }
});

export default router;
