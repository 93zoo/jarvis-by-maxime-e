import { Router, Request, Response as ExpressRes, NextFunction } from "express";

const router = Router();
const GH_BASE = "https://api.github.com";

// ── Auth guard ─────────────────────────────────────────────────────────────
// Priority order:
//   1. X-Jarvis-Key header matches SESSION_SECRET → allow (future key-based auth)
//   2. No X-Forwarded-For → same-container direct call → allow
//   3. SESSION_SECRET not configured → allow (not yet secured)
//   4. Request host/origin contains "replit" or "expo" → from JARVIS app → allow
//   5. Else → 403
function requireApiKey(req: Request, res: ExpressRes, next: NextFunction): void {
  const secret   = process.env.SESSION_SECRET;
  const provided = req.headers["x-jarvis-key"] as string | undefined;

  if (secret && provided === secret) { next(); return; }

  const forwarded = req.headers["x-forwarded-for"] as string | undefined;
  if (!forwarded)  { next(); return; }  // direct container call

  if (!secret) { next(); return; }      // SESSION_SECRET not set → open

  const host    = (req.headers.host    ?? "") as string;
  const origin  = (req.headers.origin  ?? "") as string;
  const referer = (req.headers.referer ?? "") as string;
  if (
    host.includes("replit") || host.includes("expo") ||
    origin.includes("replit") || referer.includes("replit")
  ) { next(); return; }

  res.status(403).json({ error: "Forbidden" });
}

router.use(requireApiKey);

// ── GitHub REST helper (uses GITHUB_PERSONAL_ACCESS_TOKEN) ────────────────
// Returns the global fetch Response — NOT the Express Response type.
async function gh(
  path: string,
  opts: RequestInit = {}
): Promise<globalThis.Response> {
  const token = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (!token) throw Object.assign(new Error("GITHUB_PERSONAL_ACCESS_TOKEN not set"), { status: 500 });

  const url = `${GH_BASE}${path}`;
  const r = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "JARVIS-AI/1.0",
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw Object.assign(new Error(`GitHub API ${r.status}: ${body.slice(0, 120)}`), { status: r.status });
  }
  return r;
}

// ── GET /api/github/user ───────────────────────────────────────────────────
router.get("/user", async (_req, res: ExpressRes) => {
  try {
    const r = await gh("/user");
    const data = await r.json() as { login: string; name: string; avatar_url: string; bio: string; public_repos: number };
    res.json({ login: data.login, name: data.name, avatar: data.avatar_url, bio: data.bio, publicRepos: data.public_repos });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "GitHub API error" });
  }
});

// ── GET /api/github/notifications ─────────────────────────────────────────
router.get("/notifications", async (_req, res: ExpressRes) => {
  try {
    const r = await gh("/notifications?all=false&per_page=20");
    const data = await r.json() as Array<{
      id: string; reason: string;
      subject: { title: string; type: string };
      repository: { full_name: string };
      updated_at: string;
    }>;
    const items = Array.isArray(data) ? data.map((n) => ({
      id: n.id,
      reason: n.reason,
      title: n.subject?.title,
      type: n.subject?.type,
      repo: n.repository?.full_name,
      updatedAt: n.updated_at,
    })) : [];
    res.json({ items });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "GitHub API error" });
  }
});

// ── GET /api/github/repos ─────────────────────────────────────────────────
router.get("/repos", async (_req, res: ExpressRes) => {
  try {
    const r = await gh("/user/repos?sort=updated&per_page=30");
    const data = await r.json() as Array<{
      id: number; full_name: string; description: string; private: boolean;
      language: string; stargazers_count: number; pushed_at: string;
    }>;
    const repos = Array.isArray(data) ? data.map((repo) => ({
      id: repo.id, name: repo.full_name, description: repo.description,
      private: repo.private, language: repo.language,
      stars: repo.stargazers_count, pushedAt: repo.pushed_at,
    })) : [];
    res.json({ repos });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "GitHub API error" });
  }
});

// ── GET /api/github/issues?repo=owner/repo ────────────────────────────────
router.get("/issues", async (req, res: ExpressRes) => {
  const repo = String(req.query.repo ?? "").trim();
  if (!repo || !repo.includes("/")) {
    res.status(400).json({ error: "repo param required (owner/repo)" });
    return;
  }
  try {
    const r = await gh(`/repos/${repo}/issues?state=open&per_page=20`);
    const data = await r.json() as Array<{
      number: number; title: string; state: string;
      user: { login: string }; created_at: string; html_url: string;
      labels: Array<{ name: string }>;
    }>;
    const issues = Array.isArray(data) ? data.map((i) => ({
      number: i.number, title: i.title, state: i.state,
      author: i.user?.login, createdAt: i.created_at,
      url: i.html_url, labels: i.labels?.map((l) => l.name),
    })) : [];
    res.json({ issues });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "GitHub API error" });
  }
});

// ── POST /api/github/issue ────────────────────────────────────────────────
router.post("/issue", async (req, res: ExpressRes) => {
  const { repo, title, body, labels } = req.body as { repo: string; title: string; body?: string; labels?: string[] };
  if (!repo || !title) {
    res.status(400).json({ error: "repo and title required" });
    return;
  }
  try {
    const r = await gh(`/repos/${repo}/issues`, {
      method: "POST",
      body: JSON.stringify({ title, body: body ?? "", labels: labels ?? [] }),
    });
    const data = await r.json() as { number: number; html_url: string };
    res.json({ number: data.number, url: data.html_url });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "GitHub API error" });
  }
});

export default router;
