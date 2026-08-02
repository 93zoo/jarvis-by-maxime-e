/**
 * Integration test for leaderboard reward claiming & access control.
 *
 * Requires the API server to be running locally (pnpm run dev) on
 * LEADERBOARD_TEST_BASE (default http://localhost:8080/api).
 *
 * Scenario: two players scored yesterday; an attacker who knows the winner's
 * playerId and the predictable awardId must NOT be able to read or claim the
 * winner's reward; the rightful owner can, and repeat claims are idempotent.
 *
 * Run: node scripts/test-leaderboard-claims.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";

const BASE = process.env.LEADERBOARD_TEST_BASE ?? "http://localhost:8080/api";
const SAVES = path.join(process.cwd(), ".saves");
const LB = path.join(SAVES, "leaderboard.json");
const AW = path.join(SAVES, "leaderboard-awards.json");

const OWNER_TOKEN = "tk_test_owner_secret_0001";
const ATTACKER_TOKEN = "tk_test_attacker_secret_0002";

let failures = 0;
function check(label, cond, extra = "") {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label} ${extra}`);
  }
}

async function backup(file) {
  try {
    return await fs.readFile(file, "utf-8");
  } catch {
    return null;
  }
}

async function restore(file, content) {
  if (content === null) await fs.rm(file, { force: true });
  else await fs.writeFile(file, content, "utf-8");
}

const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const awardId = `daily:${yesterday}:1`;

const lbBackup = await backup(LB);
const awBackup = await backup(AW);

try {
  // Seed: winner (with bound token) and runner-up scored yesterday.
  await fs.mkdir(SAVES, { recursive: true });
  const now = new Date().toISOString();
  await fs.writeFile(
    LB,
    JSON.stringify({
      testwinner: { name: "Winner", level: 10, lastTotal: 5000, days: { [yesterday]: 5000 }, updatedAt: now, token: OWNER_TOKEN },
      testloser: { name: "Loser", level: 5, lastTotal: 100, days: { [yesterday]: 100 }, updatedAt: now, token: ATTACKER_TOKEN },
      // Legacy entry from before token support: unbound, high score.
      testlegacy: { name: "Legacy", level: 9, lastTotal: 4000, days: { [yesterday]: 4000 }, updatedAt: now },
    }),
  );
  await fs.rm(AW, { force: true });

  const claim = (token) =>
    fetch(`${BASE}/leaderboard/rewards/claim`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { "x-player-token": token } : {}) },
      body: JSON.stringify({ playerId: "testwinner", awardId }),
    });

  console.log("Leaderboard reward claim access control:");

  // Trigger settlement + rewards read as the owner.
  const ownRead = await fetch(`${BASE}/leaderboard/rewards?playerId=testwinner`, {
    headers: { "x-player-token": OWNER_TOKEN },
  });
  const ownBody = await ownRead.json();
  check("owner can read their pending rewards", ownRead.status === 200 && ownBody.pending?.length === 1, JSON.stringify(ownBody));

  // Attacker cannot read the winner's rewards.
  const atkRead = await fetch(`${BASE}/leaderboard/rewards?playerId=testwinner`, {
    headers: { "x-player-token": ATTACKER_TOKEN },
  });
  check("attacker cannot read winner's rewards", atkRead.status === 403);

  // Attacker cannot claim, even knowing playerId + predictable awardId.
  check("attacker claim (wrong token) rejected", (await claim(ATTACKER_TOKEN)).status === 403);
  check("anonymous claim (no token) rejected", (await claim(undefined)).status === 403);

  // Award must still be claimable by the rightful owner.
  const ok = await claim(OWNER_TOKEN);
  const okBody = await ok.json();
  check("owner claim succeeds", ok.status === 200 && okBody.reward?.gold > 0, JSON.stringify(okBody));

  // Repeat claim by owner: idempotent success, flagged so clients don't double-credit.
  const again = await claim(OWNER_TOKEN);
  const againBody = await again.json();
  check("repeat owner claim is idempotent", again.status === 200 && againBody.alreadyClaimed === true);

  // Attacker still rejected after claim.
  check("attacker still rejected after claim", (await claim(ATTACKER_TOKEN)).status === 403);

  // ── Legacy (tokenless) entries: nothing to bind to or steal ──
  // No award was ever settled for the unbound legacy entry despite its score.
  const legacyAward = `daily:${yesterday}:2`; // would be rank 2 if eligible
  const legacyClaim = await fetch(`${BASE}/leaderboard/rewards/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-player-token": ATTACKER_TOKEN },
    body: JSON.stringify({ playerId: "testlegacy", awardId: legacyAward }),
  });
  check("no claimable award exists for unbound legacy entry", legacyClaim.status === 404);

  // Attacker cannot read a legacy entry's rewards.
  const legacyRead = await fetch(`${BASE}/leaderboard/rewards?playerId=testlegacy`, {
    headers: { "x-player-token": ATTACKER_TOKEN },
  });
  check("attacker cannot read legacy entry's rewards", legacyRead.status === 403);

  // Binding a legacy entry via report wipes its banked points (fresh start).
  const rebind = await fetch(`${BASE}/leaderboard/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-player-token": ATTACKER_TOKEN },
    body: JSON.stringify({ playerId: "testlegacy", name: "Legacy", level: 9, totalXP: 4000 }),
  });
  const rebindBody = await rebind.json();
  check("rebinding a legacy entry banks no points", rebind.status === 200 && rebindBody.banked === 0);
  const lbAfter = await (await fetch(`${BASE}/leaderboard?period=weekly`)).json();
  const legacyRow = lbAfter.entries.find((e) => e.playerId === "testlegacy");
  check("legacy entry's old points were wiped on rebind", legacyRow === undefined, JSON.stringify(legacyRow));

  // Score reports with a wrong token must not corrupt the winner's entry.
  const spoof = await fetch(`${BASE}/leaderboard/report`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-player-token": ATTACKER_TOKEN },
    body: JSON.stringify({ playerId: "testwinner", name: "Hacked", level: 1, totalXP: 999999 }),
  });
  check("spoofed score report rejected", spoof.status === 403);
} finally {
  await restore(LB, lbBackup);
  await restore(AW, awBackup);
}

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll checks passed");
