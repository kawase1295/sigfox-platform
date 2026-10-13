import { sqliteTable, text } from "drizzle-orm/sqlite-core";

// Instance-wide key/value settings; exists mainly so the migration pipeline has a first table.
export const settings = sqliteTable("settings", {
	key: text("key").primaryKey(),
	value: text("value").notNull(),
});
