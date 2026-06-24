import { Router } from "express";
import multer from "multer";
import OpenAI from "openai";
import { toFile } from "openai";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function getOpenAI() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey: key });
}

const DEFAULT_SYSTEM_PROMPT = `You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), an advanced AI assistant created by Maxime-E. You are highly intelligent, precise, and helpful. You speak in a calm, sophisticated manner — like the AI from Iron Man. You are concise but thorough. You refer to the user as "sir" or "ma'am" occasionally. Keep responses clear and actionable.`;

// ── POST /api/ai/chat — streaming chat completions ────────────────────────────
router.post("/chat", async (req, res) => {
  const { messages, model = "gpt-4o-mini", systemPrompt } = req.body as {
    messages: Array<{ role: string; content: string }>;
    model?: string;
    systemPrompt?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array required" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  try {
    const openai = getOpenAI();
    const stream = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt?.trim() || DEFAULT_SYSTEM_PROMPT },
        ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ],
      stream: true,
      max_tokens: 2048,
    });

    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    }
    res.write("data: [DONE]\n\n");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
  } finally {
    res.end();
  }
});

// ── POST /api/ai/transcribe — Whisper transcription ───────────────────────────
router.post("/transcribe", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "audio file required" });
    return;
  }

  try {
    const openai = getOpenAI();
    const audioFile = await toFile(req.file.buffer, req.file.originalname || "audio.m4a", {
      type: req.file.mimetype || "audio/m4a",
    });

    const transcription = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
    });

    res.json({ text: transcription.text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ── POST /api/ai/search — Web search via GPT-4o mini search preview ───────────
router.post("/search", async (req, res) => {
  const { query } = req.body as { query: string };
  if (!query?.trim()) {
    res.status(400).json({ error: "query required" });
    return;
  }

  try {
    const openai = getOpenAI();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini-search-preview",
      messages: [
        {
          role: "system",
          content:
            "You are JARVIS, an AI assistant. Answer the user's question with current, accurate information from the web. Be concise and cite sources when relevant. Speak in JARVIS's sophisticated tone.",
        },
        { role: "user", content: query.trim() },
      ],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(({ web_search_options: {} } as any)),
    });

    const content = completion.choices[0]?.message?.content || "No results found.";
    res.json({ result: content });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

// ── GET /api/ai/weather — Weather via wttr.in ─────────────────────────────────
router.get("/weather", async (req, res) => {
  const city = (req.query.city as string)?.trim();
  if (!city) {
    res.status(400).json({ error: "city query param required" });
    return;
  }

  try {
    const encoded = encodeURIComponent(city);
    const response = await fetch(`https://wttr.in/${encoded}?format=j1`);
    if (!response.ok) throw new Error(`wttr.in returned ${response.status}`);
    const data = await response.json() as {
      current_condition: Array<{
        temp_C: string;
        weatherDesc: Array<{ value: string }>;
        humidity: string;
        windspeedKmph: string;
        FeelsLikeC: string;
      }>;
      nearest_area: Array<{
        areaName: Array<{ value: string }>;
        country: Array<{ value: string }>;
      }>;
    };

    const current = data.current_condition[0];
    const area = data.nearest_area[0];

    res.json({
      city: `${area.areaName[0].value}, ${area.country[0].value}`,
      tempC: current.temp_C,
      feelsLikeC: current.FeelsLikeC,
      condition: current.weatherDesc[0].value,
      humidity: current.humidity,
      windKmph: current.windspeedKmph,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: msg });
  }
});

export default router;
