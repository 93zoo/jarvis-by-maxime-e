import {
  pgTable,
  text,
  integer,
  boolean,
  jsonb,
  timestamp,
  doublePrecision,
  primaryKey,
} from "drizzle-orm/pg-core";

/** One leaderboard entry per player. `days` maps "YYYY-MM-DD" (UTC) → points. */
export const leaderboardEntriesTable = pgTable("leaderboard_entries", {
  playerId: text("player_id").primaryKey(),
  name: text("name").notNull(),
  level: integer("level").notNull().default(1),
  /** Last cumulative counter reported by the client. */
  lastTotal: doublePrecision("last_total").notNull().default(0),
  days: jsonb("days").$type<Record<string, number>>().notNull().default({}),
  /** Secret bound on first authenticated report (trust on first use). */
  token: text("token"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Claimable top-3 rewards for finished daily/weekly periods. */
export const leaderboardAwardsTable = pgTable("leaderboard_awards", {
  /** e.g. "daily:2026-08-01:1" */
  id: text("id").primaryKey(),
  playerId: text("player_id").notNull(),
  name: text("name").notNull(),
  period: text("period").$type<"daily" | "weekly">().notNull(),
  /** "YYYY-MM-DD" for daily, "YYYY-Www" for weekly. */
  periodKey: text("period_key").notNull(),
  rank: integer("rank").notNull(),
  gold: integer("gold").notNull(),
  materials: jsonb("materials").$type<{ id: string; qty: number }[]>().notNull().default([]),
  title: text("title").notNull(),
  claimed: boolean("claimed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Idempotency markers: a period that appears here has already been settled. */
export const leaderboardSettledTable = pgTable(
  "leaderboard_settled",
  {
    period: text("period").$type<"daily" | "weekly">().notNull(),
    periodKey: text("period_key").notNull(),
  },
  (t) => [primaryKey({ columns: [t.period, t.periodKey] })],
);

export type LeaderboardEntry = typeof leaderboardEntriesTable.$inferSelect;
export type LeaderboardAward = typeof leaderboardAwardsTable.$inferSelect;
