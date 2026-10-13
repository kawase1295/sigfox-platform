import { eq, getTableColumns, sql } from "drizzle-orm";
import type { Parser } from "#shared/parsers";
import type { Db } from "./client";
import { parsers } from "./schema";

export type ParserRow = typeof parsers.$inferSelect;

// Why the raw qualified name: drizzle renders ${parsers.id} unqualified, which would bind to devices.id here.
const deviceCount = sql<number>`(select count(*) from devices d where d.parser_id = "parsers"."id")`;

const toParser = (r: ParserRow & { deviceCount: number }): Parser => ({
	id: r.id,
	name: r.name,
	code: r.code,
	deviceCount: r.deviceCount,
	createdAt: r.createdAt.toISOString(),
	updatedAt: r.updatedAt.toISOString(),
});

const selectParsers = (db: Db) =>
	db
		.select({ ...getTableColumns(parsers), deviceCount })
		.from(parsers)
		.$dynamic();

export async function listParsers(db: Db): Promise<Parser[]> {
	return (await selectParsers(db).orderBy(parsers.name, parsers.id)).map(toParser);
}

export async function getParser(db: Db, id: string): Promise<Parser | null> {
	const row = await selectParsers(db).where(eq(parsers.id, id)).get();
	return row ? toParser(row) : null;
}

export async function parserExists(db: Db, id: string): Promise<boolean> {
	return (await db.select({ id: parsers.id }).from(parsers).where(eq(parsers.id, id)).get()) !== undefined;
}

export async function insertParser(db: Db, input: { name: string; code: string }, now = new Date()): Promise<Parser> {
	const row = await db
		.insert(parsers)
		.values({ id: crypto.randomUUID(), ...input, createdAt: now, updatedAt: now })
		.returning()
		.get();
	return toParser({ ...row, deviceCount: 0 });
}

export async function updateParser(
	db: Db,
	id: string,
	changes: { name?: string; code?: string },
	now = new Date(),
): Promise<Parser | null> {
	const row = await db
		.update(parsers)
		.set({ ...changes, updatedAt: now })
		.where(eq(parsers.id, id))
		.returning({ id: parsers.id })
		.get();
	return row ? getParser(db, id) : null;
}

export async function deleteParser(db: Db, id: string): Promise<boolean> {
	const row = await db.delete(parsers).where(eq(parsers.id, id)).returning({ id: parsers.id }).get();
	return row !== undefined;
}
