import { inArray, lt } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { createDb } from "../db/client";
import { messages } from "../db/schema";

export const DEFAULT_RETENTION_DAYS = 365;

export type RetentionDays = { ok: true; days: number } | { ok: false; error: string };

/** `undefined` means the variable is not declared at all; anything else must be a plain non-negative integer. */
export function parseRetentionDays(raw: string | undefined): RetentionDays {
	if (raw === undefined) return { ok: true, days: DEFAULT_RETENTION_DAYS };
	// Why not Number(raw): it accepts "", " 30", "1e3" and "0x10", which would silently purge on a typo.
	if (!/^\d+$/.test(raw))
		return { ok: false, error: `RETENTION_DAYS must be a non-negative integer, got ${JSON.stringify(raw)}` };
	const days = Number(raw);
	if (!Number.isSafeInteger(days)) return { ok: false, error: `RETENTION_DAYS is too large: ${raw}` };
	return { ok: true, days };
}

/** A table whose rows expire by a time column. Devices are never a target: they outlive their data. */
export type PurgeTarget = {
	name: string;
	table: SQLiteTable;
	id: SQLiteColumn;
	time: SQLiteColumn;
	/** Unit of `time`: messages keep Sigfox epoch seconds, timestamp_ms columns use milliseconds. */
	unit: "s" | "ms";
};

export const PURGE_TARGETS: PurgeTarget[] = [
	{ name: "messages", table: messages, id: messages.id, time: messages.time, unit: "s" },
];

export type PurgeOptions = {
	days: number;
	now: Date;
	batchSize?: number;
	/** Upper bound on DELETE statements per run, shared by all targets. */
	maxStatements?: number;
	targets?: PurgeTarget[];
};

export type PurgeResult = {
	deleted: Record<string, number>;
	/** False when the statement budget ran out before every target was drained; the next run continues. */
	complete: boolean;
	skipped?: "keep-forever";
};

// Why 1000 rows and 40 statements: keeps each statement short under D1's per-query time limit and the whole run
// under the free plan's 50 queries per invocation. A backlog beyond 40k rows simply drains over several days.
const BATCH_SIZE = 1000;
const MAX_STATEMENTS = 40;

/**
 * Deletes rows with `time < now - days`. A row exactly at the cutoff is kept, so "N days" means at least N full
 * days of history survive. `days === 0` keeps everything.
 */
export async function purgeExpired(d1: D1Database, options: PurgeOptions): Promise<PurgeResult> {
	const { days, now, batchSize = BATCH_SIZE, maxStatements = MAX_STATEMENTS, targets = PURGE_TARGETS } = options;
	if (days === 0) return { deleted: {}, complete: true, skipped: "keep-forever" };

	const db = createDb(d1);
	const cutoffMs = now.getTime() - days * 86_400_000;
	const deleted: Record<string, number> = {};
	let budget = maxStatements;

	for (const target of targets) {
		const cutoff = target.unit === "s" ? Math.floor(cutoffMs / 1000) : cutoffMs;
		let count = 0;
		while (true) {
			if (budget === 0) return { deleted: { ...deleted, [target.name]: count }, complete: false };
			budget--;
			// Why a LIMITed subquery: SQLite's DELETE ... LIMIT is a compile-time option D1 does not enable.
			const expired = db.select({ id: target.id }).from(target.table).where(lt(target.time, cutoff)).limit(batchSize);
			const result = await db.delete(target.table).where(inArray(target.id, expired)).run();
			const changes = result.meta.changes ?? 0;
			count += changes;
			if (changes < batchSize) break;
		}
		deleted[target.name] = count;
	}
	return { deleted, complete: true };
}

/** Entry point for the daily Cron Trigger. An invalid setting skips the purge rather than guessing a window. */
export async function runRetention(env: { DB: D1Database; RETENTION_DAYS?: string }, now: Date): Promise<void> {
	const parsed = parseRetentionDays(env.RETENTION_DAYS);
	if (!parsed.ok) {
		console.error(`retention: purge skipped. ${parsed.error}`);
		return;
	}
	const result = await purgeExpired(env.DB, { days: parsed.days, now });
	console.log("retention:", JSON.stringify({ days: parsed.days, ...result }));
}
