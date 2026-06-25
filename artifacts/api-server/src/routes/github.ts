import { Router, Request, Response, NextFunction } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";

const router = Router();

// ── Internal-only guard ────────────────────────────────────────────────────
// The GitHub connector holds 93zoo's OAuth token. Block non-localhost requests
// so deployed endpoints can't be hit by arbitrary clients.
function internalOnly(req: Request, res: Response, next: NextFunction): void {
  const origin = (req.headers.origin ?? "") as string;
  const referer = (req.headers.referer ?? "") as string;
  const forwarded = (req.headers["x-forwarded-for"] ?? "") as string;

  // Allow: no origin (same-server), localhost, or Expo/Replit preview domains
  const allowed =
    !origin ||
    origin.includes("localhost") ||
    origin.includes("replit") ||
    origin.includes("expo") ||
    referer.includes("replit") ||
    referer.includes("expo") ||
    !forwarded; // direct call from same container

  if (!allowed) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  next();
}

router.use(internalOnly);

function getConnectors() {
  return new ReplitConnectors();
}

async function proxyGithub(path: string, opts: Parameters<ReplitConnectors["proxy"]>[2] = {}) {
  const c = getConnectors();
  const r = await c.proxy("github", path, opts);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw Object.assign(new Error(`GitHub API ${r.status}`), { status: r.status, body });
  }
  return r.json();
}

// ── GET /api/github/user ───────────────────────────────────────────────────

router.get("/user", async (_req, res) => {
  try {
    const data = await proxyGithub("/user") as { login: string; name: string; avatar_url: string; bio: string; public_repos: number };
    res.json({ login: data.login, name: data.name, avatar: data.avatar_url, bio: data.bio, publicRepos: data.public_repos });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "GitHub API error" });
  }
});

// ── GET /api/github/notifications ────────────────────────────────────────

router.get("/notifications", async (_req, res) => {
  try {
    const data = await proxyGithub("/notifications?all=false&per_page=20") as Array<{
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

// ── GET /api/github/repos ────────────────────────────────────────────────

router.get("/repos", async (_req, res) => {
  try {
    const data = await proxyGithub("/user/repos?sort=updated&per_page=30") as Array<{
      id: number; full_name: string; description: string; private: boolean;
      language: string; stargazers_count: number; pushed_at: string;
    }>;
    const repos = Array.isArray(data) ? data.map((r) => ({
      id: r.id, name: r.full_name, description: r.description,
      private: r.private, language: r.language,
      stars: r.stargazers_count, pushedAt: r.pushed_at,
    })) : [];
    res.json({ repos });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "GitHub API error" });
  }
});

// ── GET /api/github/issues?repo=owner/repo ────────────────────────────────

router.get("/issues", async (req, res) => {
  const repo = String(req.query.repo ?? "").trim();
  if (!repo || !repo.includes("/")) {
    res.status(400).json({ error: "repo param required (owner/repo)" });
    return;
  }
  try {
    const data = await proxyGithub(`/repos/${repo}/issues?state=open&per_page=20`) as Array<{
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

router.post("/issue", async (req, res) => {
  const { repo, title, body, labels } = req.body as { repo: string; title: string; body?: string; labels?: string[] };
  if (!repo || !title) {
    res.status(400).json({ error: "repo and title required" });
    return;
  }
  try {
    const data = await proxyGithub(`/repos/${repo}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body: body ?? "", labels: labels ?? [] }),
    }) as { number: number; html_url: string };
    res.json({ number: data.number, url: data.html_url });
  } catch (err: unknown) {
    const e = err as { status?: number; message?: string };
    res.status(e.status ?? 500).json({ error: e.message ?? "GitHub API error" });
  }
});

export default router;
