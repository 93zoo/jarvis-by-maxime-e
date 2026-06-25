import { Router } from "express";
import OpenAI from "openai";

const router = Router();

const VALID_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
type Voice = typeof VALID_VOICES[number];

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not set");
  return new OpenAI({ apiKey: key });
}

/**
 * GET /api/tts?text=...&voice=onyx
 * Returns MP3 audio stream via OpenAI TTS.
 * Text is capped at 1000 chars for cost/latency.
 */
router.get("/", async (req, res) => {
  try {
    const text = String(req.query.text ?? "").trim().slice(0, 1000);
    const voice: Voice = VALID_VOICES.includes(req.query.voice as Voice)
      ? (req.query.voice as Voice)
      : "onyx";

    if (!text) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const openai = getOpenAI();
    const mp3 = await openai.audio.speech.create({
      model: "tts-1",
      voice,
      input: text,
      response_format: "mp3",
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    res.set("Content-Type", "audio/mpeg");
    res.set("Content-Length", String(buffer.length));
    res.set("Cache-Control", "no-store");
    res.send(buffer);
  } catch (err) {
    console.error("[TTS]", err);
    res.status(500).json({ error: "TTS generation failed" });
  }
});

export default router;
