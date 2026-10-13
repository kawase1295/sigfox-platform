import { desc } from "drizzle-orm";
import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { Lqi, Reception } from "#shared/devices";
import type { LocationSource } from "#shared/locations";
import type { ParsedEntry, ParseError } from "#shared/parsers";

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

export const parsers = sqliteTable("parsers", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	code: text("code").notNull(),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

// Why the Sigfox ID as primary key: callbacks only carry that ID, and it is unique per Sigfox backend.
export const devices = sqliteTable("devices", {
	id: text("id").primaryKey(),
	name: text("name"),
	createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	lastMessageAt: integer("last_message_at", { mode: "timestamp_ms" }),
	parserId: text("parser_id").references(() => parsers.id, { onDelete: "set null" }),
});

export const messages = sqliteTable(
	"messages",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		deviceId: text("device_id")
			.notNull()
			.references(() => devices.id, { onDelete: "cascade" }),
		// Epoch seconds as Sigfox sends them; part of the identity, so never converted.
		time: integer("time").notNull(),
		seqNumber: integer("seq_number").notNull(),
		data: text("data").notNull(),
		// One entry per station; DATA/UPLINK and DATA_ADVANCED reports of the same station are merged into it.
		receptions: text("receptions", { mode: "json" }).$type<Reception[]>().notNull(),
		lqi: text("lqi").$type<Lqi>(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
		updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
		// Set together: parsed on success, parseError on failure, parsedAt either way (null = never parsed).
		parsed: text("parsed", { mode: "json" }).$type<ParsedEntry[]>(),
		parseError: text("parse_error", { mode: "json" }).$type<ParseError>(),
		parsedAt: integer("parsed_at", { mode: "timestamp_ms" }),
	},
	(t) => [
		// Why time in the key: seqNumber wraps around (12 bits), so it alone does not identify a frame.
		uniqueIndex("messages_device_seq_time_unique").on(t.deviceId, t.seqNumber, t.time),
		index("messages_device_time_idx").on(t.deviceId, desc(t.time), desc(t.id)),
		// For the retention purge, which filters by time across all devices.
		index("messages_time_idx").on(t.time),
	],
);

export const locations = sqliteTable(
	"locations",
	{
		id: integer("id").primaryKey({ autoIncrement: true }),
		deviceId: text("device_id")
			.notNull()
			.references(() => devices.id, { onDelete: "cascade" }),
		// Why not nullable with set null: every position comes from a frame, and one outliving its frame would
		// survive retention with no way to trace it back. A future manual position can relax this.
		messageId: integer("message_id")
			.notNull()
			.references(() => messages.id, { onDelete: "cascade" }),
		// Epoch seconds, copied from the message so track and retention queries need no join.
		time: integer("time").notNull(),
		lat: real("lat").notNull(),
		lng: real("lng").notNull(),
		accuracy: real("accuracy"),
		source: text("source").$type<LocationSource>().notNull(),
		createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
	},
	(t) => [
		// Why: redelivered callbacks and re-parses must not add the same position twice.
		uniqueIndex("locations_message_source_unique").on(t.messageId, t.source),
		index("locations_device_time_idx").on(t.deviceId, desc(t.time), desc(t.id)),
		index("locations_time_idx").on(t.time),
	],
);
