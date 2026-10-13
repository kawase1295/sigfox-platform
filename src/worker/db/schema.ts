import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Instance-wide key/value settings; exists mainly so the migration pipeline has a first table.
export const settings = sqliteTable("settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
});

// Identity comes from Cloudflare Access; this table only gives the email a stable id for foreign keys.
export const users = sqliteTable("users", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	email: text("email").notNull().unique(),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" }).notNull(),
});

// Why only the hash: a database leak must not hand out working callback credentials.
export const apiTokens = sqliteTable("api_tokens", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	tokenHash: text("token_hash").notNull().unique(),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
	revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
	createdBy: integer("created_by").references(() => users.id, { onDelete: "set null" }),
});
