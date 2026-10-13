import { and, eq, type SQL, sql } from "drizzle-orm";
import type { Lqi, Reception } from "#shared/devices";
import type { Db } from "../db/client";
import type { DeviceRow, MessageRow } from "../db/devices";
import { devices, messages } from "../db/schema";

export type IngestResult = {
	device: DeviceRow;
	message: MessageRow;
	/** A new message row was inserted. */
	created: boolean;
	/** The message is new or gained information; false for an exact redelivery. */
	changed: boolean;
	/** The device was auto-registered by this callback. */
	deviceCreated: boolean;
};

/** What one Sigfox DATA callback (UPLINK or ADVANCED) knows about a frame. */
export type Frame = {
	device: string;
	time: number;
	seqNumber: number;
	data: string;
	receptions: Reception[];
	lqi?: Lqi | null;
};

/**
 * Stores what a callback knows about a frame. Order-independent and idempotent: every callback for the same frame
 * (any station, UPLINK or ADVANCED, redelivered or not) collapses into one message keyed by device + seqNumber + time.
 */
export async function ingestFrame(db: Db, frame: Frame, now = new Date()): Promise<IngestResult> {
	const device = await registerDevice(db, frame.device, new Date(frame.time * 1000), now);
	const deviceCreated = device.createdAt.getTime() === now.getTime();

	const inserted = await db
		.insert(messages)
		.values({
			deviceId: frame.device,
			time: frame.time,
			seqNumber: frame.seqNumber,
			data: frame.data,
			receptions: [],
			lqi: frame.lqi ?? null,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing()
		.returning()
		.get();
	const merged = await mergeIntoMessage(db, frame, now);
	if (inserted) return { device, message: merged.message, created: true, changed: true, deviceCreated };
	return { device, ...merged, created: false, deviceCreated };
}

function registerDevice(db: Db, id: string, messageAt: Date, now: Date): Promise<DeviceRow> {
	return db
		.insert(devices)
		.values({ id, createdAt: now, lastMessageAt: messageAt })
		.onConflictDoUpdate({
			target: devices.id,
			// Why max: callbacks may arrive out of order, and an older frame must not move the clock back.
			set: { lastMessageAt: sql`max(coalesce(${devices.lastMessageAt}, 0), ${messageAt.getTime()})` },
		})
		.returning()
		.get();
}

// Fixed key order so stored entries look the same whichever callback created them.
const canonical = (r: Reception): Reception => ({
	station: r.station,
	rssi: r.rssi,
	...(r.snr === undefined ? {} : { snr: r.snr }),
	...(r.nbRep === undefined ? {} : { nbRep: r.nbRep }),
	source: r.source,
});

/**
 * What a reception changes on an entry for the same station. DATA/UPLINK owns rssi/snr (reported per station
 * directly); DATA_ADVANCED only adds nbRep there, so a station is never counted twice.
 */
const patchFor = (r: Reception) =>
	r.source === "uplink"
		? { rssi: r.rssi, snr: r.snr, source: r.source }
		: r.nbRep === undefined
			? {}
			: { nbRep: r.nbRep };

/**
 * One statement per station, all in one D1 batch. Why SQL instead of merging in TypeScript: stations report the
 * same frame concurrently, and each statement reads and writes the list atomically, so no update is lost and no
 * retry loop can starve.
 */
async function mergeIntoMessage(db: Db, frame: Frame, now: Date): Promise<{ message: MessageRow; changed: boolean }> {
	const key = and(
		eq(messages.deviceId, frame.device),
		eq(messages.seqNumber, frame.seqNumber),
		eq(messages.time, frame.time),
	);
	const update = (set: { receptions?: SQL; lqi?: SQL }, next: SQL) =>
		db
			.update(messages)
			.set({
				...set,
				updatedAt: sql`case when ${next} is ${messages.receptions} and ${set.lqi ?? messages.lqi} is ${messages.lqi} then ${messages.updatedAt} else ${now.getTime()} end`,
			})
			.where(key)
			.returning();

	const statements = frame.receptions.map((r) => {
		const same = sql`json_extract(value, '$.station') = ${r.station}`;
		const heard = sql`exists (select 1 from json_each(${messages.receptions}) where ${same})`;
		const patched = sql`(select json_group_array(case when ${same} then json_patch(value, ${JSON.stringify(patchFor(r))}) else json(value) end) from json_each(${messages.receptions}))`;
		const appended = sql`json_insert(${messages.receptions}, '$[#]', json(${JSON.stringify(canonical(r))}))`;
		const next = sql`case when ${heard} then ${patched} else ${appended} end`;
		return update({ receptions: next }, next);
	});
	const lqi = frame.lqi ? sql`${frame.lqi}` : undefined;
	// Without receptions this statement is also what reads the row back.
	if (lqi || statements.length === 0) statements.push(update(lqi ? { lqi } : {}, sql`${messages.receptions}`));

	const [first, ...rest] = statements;
	if (!first) throw new Error("unreachable");
	const results = await db.batch([first, ...rest]);
	const rows = results.map((r) => r[0]);
	const message = rows.at(-1);
	if (!message) throw new Error(`message ${frame.device}/${frame.seqNumber}/${frame.time} vanished while merging`);
	return { message, changed: rows.some((r) => r?.updatedAt.getTime() === now.getTime()) };
}
