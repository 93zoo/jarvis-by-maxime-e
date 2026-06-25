/**
 * Push local commits to GitHub via Git Data API using Replit connector SDK.
 * Usage: node scripts/push-to-github.mjs
 */
import { execSync } from "child_process";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const { ReplitConnectors } = require(
  path.join(__dirname, "../artifacts/api-server/node_modules/@replit/connectors-sdk/index.js")
);

const OWNER       = "93zoo";
const REPO        = "jarvis-by-maxime-e";
const BRANCH      = "main";
const REMOTE_BASE = "7591082"; // last SHA on GitHub
const ROOT        = path.join(__dirname, "..");

const c = new ReplitConnectors();

async function ghApi(endpoint, opts = {}) {
  const res = await c.proxy("github", endpoint, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`GitHub ${endpoint} → ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

async function main() {
  // 1. Changed files since last push
  const diff = execSync(`git diff --name-status ${REMOTE_BASE} HEAD`, { cwd: ROOT, encoding: "utf8" });
  const files = diff.trim().split("\n")
    .map(l => { const [s, p] = l.split("\t"); return { status: s?.trim(), path: p?.trim() }; })
    .filter(f => f.path);

  console.log(`\n📦 ${files.length} changed files`);

  // 2. Remote HEAD & base tree
  const ref    = await ghApi(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`);
  const remote = ref.object.sha;
  const commit = await ghApi(`/repos/${OWNER}/${REPO}/git/commits/${remote}`);
  const baseTree = commit.tree.sha;
  console.log(`🔗 Remote HEAD: ${remote.slice(0, 7)}  base-tree: ${baseTree.slice(0, 7)}`);

  // 3. Create blobs (skip .github/workflows — needs `workflow` scope)
  const tree = [];
  const skipped = [];

  for (const { status, path: fp } of files) {
    if (fp.startsWith(".github/workflows")) { skipped.push(fp); continue; }
    if (status === "D") {
      tree.push({ path: fp, mode: "100644", type: "blob", sha: null });
      console.log(`  🗑  ${fp}`);
      continue;
    }
    let buf;
    try { buf = readFileSync(path.join(ROOT, fp)); }
    catch { console.warn(`  ⚠️  skip (unreadable): ${fp}`); skipped.push(fp); continue; }

    const blob = await ghApi(`/repos/${OWNER}/${REPO}/git/blobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: buf.toString("base64"), encoding: "base64" }),
    });
    tree.push({ path: fp, mode: "100644", type: "blob", sha: blob.sha });
    console.log(`  ✅ ${fp.split("/").pop()} → ${blob.sha.slice(0, 7)}`);
  }

  // 4. New tree
  const newTree = await ghApi(`/repos/${OWNER}/${REPO}/git/trees`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ base_tree: baseTree, tree }),
  });
  console.log(`\n🌲 New tree: ${newTree.sha.slice(0, 7)}`);

  // 5. New commit
  const msg = [
    "feat: JARVIS session 2+3 — TTS OpenAI, Tasks/Notes agenda, GPS nav, GitHub routes",
    "",
    "Squash of commits ahead of " + REMOTE_BASE + ":",
    execSync(`git log --oneline ${REMOTE_BASE}..HEAD`, { cwd: ROOT, encoding: "utf8" }).trim(),
  ].join("\n");

  const newCommit = await ghApi(`/repos/${OWNER}/${REPO}/git/commits`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: msg, tree: newTree.sha, parents: [remote] }),
  });
  console.log(`📝 New commit: ${newCommit.sha.slice(0, 7)}`);

  // 6. Update ref
  await ghApi(`/repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sha: newCommit.sha }),
  });

  console.log(`\n🚀 ${BRANCH} → ${newCommit.sha.slice(0, 7)}`);
  if (skipped.length) console.log(`⚠️  Skipped (needs 'workflow' scope): ${skipped.join(", ")}`);
  console.log("✅ Done!");
}

main().catch(e => { console.error("❌", e.message); process.exit(1); });
