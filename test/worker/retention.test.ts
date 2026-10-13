import { createScheduledController } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "../../src/worker/db/client";
import { devices, locations, messages } from "../../src/worker/db/schema";
import worker from "../../src/worker/index";
import {
	DEFAULT_RETENTION_DAYS,
	PURGE_TARGETS,
	parseRetentionDays,
	purgeExpired,
	runRetention,
} from "../../src/worker/services/retention";
import { randomHex } from "./helpers/api";

const DAY = 86_400;
// Far older than any row other tests insert, so purges here never touch their data in the shared D1.
const NOW_S = 1_000_000_000;
const NOW = new Date(NOW_S * 1000);

async function seedDevice(times: number[]) {
	const db = createDb(env.DB);
	const id = randomHex(6);
	await db.insert(devices).values({ id, createdAt: NOW });
	for (const [i, time] of times.entries()) {
		await db
			.insert(messages)
			.values({ deviceId: id, time, seqNumber: i, data: "00", receptions: [], createdAt: NOW, updatedAt: NOW });
	}
	return id;
}

const remainingTimes = async (deviceId: string) =>
	(
		await createDb(env.DB)
			.select({ time: messages.time })
			.from(messages)
			.where(eq(messages.deviceId, deviceId))
			.orderBy(messages.time)
	).map((r) => r.time);

const deviceExists = async (deviceId: string) =>
	(await createDb(env.DB).select().from(devices).where(eq(devices.id, deviceId)).get()) !== undefined;

describe("parseRetentionDays", () => {
	it("defaults to 365 days when unset", () => {
		expect(DEFAULT_RETENTION_DAYS).toBe(365);
		expect(parseRetentionDays(undefined)).toEqual({ ok: true, days: 365 });
	});

	it("accepts non-negative integers, including 0 for keep forever", () => {
		expect(parseRetentionDays("0")).toEqual({ ok: true, days: 0 });
		expect(parseRetentionDays("30")).toEqual({ ok: true, days: 30 });
	});

	it.each(["", " 30", "-1", "1.5", "abc", "1e3", "0x10"])("rejects %j", (raw) => {
		expect(parseRetentionDays(raw).ok).toBe(false);
	});
});

describe("purgeExpired", () => {
	it("deletes messages older than the cutoff and keeps the one exactly at it", async () => {
		const cutoff = NOW_S - 30 * DAY;
		const id = await seedDevice([cutoff - 1, cutoff, cutoff + 1, NOW_S]);

		const result = await purgeExpired(env.DB, { days: 30, now: NOW });

		expect(await remainingTimes(id)).toEqual([cutoff, cutoff + 1, NOW_S]);
		expect(result.deleted.messages).toBeGreaterThanOrEqual(1);
		expect(result.complete).toBe(true);
		expect(await deviceExists(id)).toBe(true);
	});

	it("keeps everything when days is 0", async () => {
		const id = await seedDevice([1, NOW_S - 10_000 * DAY, NOW_S]);

		const result = await purgeExpired(env.DB, { days: 0, now: NOW });

		expect(result).toEqual({ deleted: {}, complete: true, skipped: "keep-forever" });
		expect(await remainingTimes(id)).toHaveLength(3);
	});

	it("deletes in several bounded batches", async () => {
		const id = await seedDevice(Array.from({ length: 7 }, (_, i) => NOW_S - 400 * DAY - i));

		const targets = PURGE_TARGETS.filter((t) => t.name === "messages");
		const partial = await purgeExpired(env.DB, { days: 365, now: NOW, batchSize: 2, maxStatements: 2, targets });
		expect(partial).toMatchObject({ deleted: { messages: 4 }, complete: false });
		expect((await remainingTimes(id)).length).toBeGreaterThan(0);

		const rest = await purgeExpired(env.DB, { days: 365, now: NOW, batchSize: 2, maxStatements: 10 });
		expect(rest.complete).toBe(true);
		expect(await remainingTimes(id)).toEqual([]);
		expect(await deviceExists(id)).toBe(true);
	});
});

describe("purgeExpired with locations", () => {
	it("purges expired locations along with their messages", async () => {
		const cutoff = NOW_S - 30 * DAY;
		const id = await seedDevice([cutoff - 1, cutoff]);
		const db = createDb(env.DB);
		for (const m of await db.select().from(messages).where(eq(messages.deviceId, id))) {
			await db
				.insert(locations)
				.values({ deviceId: id, messageId: m.id, time: m.time, lat: 1, lng: 2, source: "gps", createdAt: NOW });
		}

		const result = await purgeExpired(env.DB, { days: 30, now: NOW });

		const left = await db.select({ time: locations.time }).from(locations).where(eq(locations.deviceId, id));
		expect(left).toEqual([{ time: cutoff }]);
		expect(result.deleted.locations).toBeGreaterThanOrEqual(1);
	});
});

describe("runRetention", () => {
	it.each(["abc", "-1", ""])("skips the purge and deletes nothing when RETENTION_DAYS is %j", async (raw) => {
		const id = await seedDevice([1, NOW_S - 1000 * DAY]);

		await runRetention({ DB: env.DB, RETENTION_DAYS: raw }, NOW);

		expect(await remainingTimes(id)).toHaveLength(2);
	});

	it("keeps everything when RETENTION_DAYS is 0", async () => {
		const id = await seedDevice([1, NOW_S - 1000 * DAY]);

		await runRetention({ DB: env.DB, RETENTION_DAYS: "0" }, NOW);

		expect(await remainingTimes(id)).toHaveLength(2);
	});
});

describe("scheduled handler", () => {
	it("purges with the configured RETENTION_DAYS relative to the scheduled time", async () => {
		expect(env.RETENTION_DAYS).toBe("365");
		const id = await seedDevice([NOW_S - 366 * DAY, NOW_S - 364 * DAY]);

		const controller = createScheduledController({ scheduledTime: NOW, cron: "0 3 * * *" });
		await worker.scheduled(controller, env);

		expect(await remainingTimes(id)).toEqual([NOW_S - 364 * DAY]);
	});
});
