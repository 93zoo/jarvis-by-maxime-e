import { pgTable, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";

/** One cloud save per player, keyed by the (sanitized) playerId. */
export const cloudSavesTable = pgTable("cloud_saves", {
  playerId: text("player_id").primaryKey(),
  saveData: jsonb("save_data").notNull(),
  clientVersion: integer("client_version").notNull().default(1),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CloudSave = typeof cloudSavesTable.$inferSelect;
