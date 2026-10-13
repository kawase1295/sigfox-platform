import { and, eq, sql } from "drizzle-orm";
import type { Reception } from "#shared/devices";
import type { UplinkCallback } from "#shared/sigfox";
import type { Db } from "../db/client";
import type { DeviceRow, MessageRow } from "../db/devices";
import { devices, messages } from "../db/schema";

export type IngestResult = {
	device: DeviceRow;
	message: MessageRow;
	/** A new message row was inserted. */
	created: boolean;
	/** The message is new or gained a reception; false for an exact redelivery. */
	changed: boolean;
	/** The device was auto-registered by this callback. */
	deviceCreated: boolean;
};

/**
 * Stores one DATA/UPLINK reception. Order-independent and idempotent: the same frame heard by
 * several stations (or redelivered) collapses into one message keyed by device + seqNumber + time.
 */
export async function ingestUplink(db: Db, input: UplinkCallback, now = new Date()): Promise<IngestResult> {
	const device = await registerDevice(db, input.device, new Date(input.time * 1000), now);
	const reception: Reception = { station: input.station, rssi: input.rssi, snr: input.snr, source: "uplink" };

	const inserted = await db
		.insert(messages)
		.values({
			deviceId: input.device,
			time: input.time,
			seqNumber: input.seqNumber,
			data: input.data,
			receptions: [reception],
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoNothing()
		.returning()
		.get();
	if (inserted) return { device, message: inserted, created: true, changed: true, deviceCreated: isNew(device, now) };

	const message = await appendReception(db, input, reception, now);
	return {
		device,
		message,
		created: false,
		changed: message.updatedAt.getTime() === now.getTime(),
		deviceCreated: isNew(device, now),
	};
}

const isNew = (device: DeviceRow, now: Date) => device.createdAt.getTime() === now.getTime();

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

// Why one SQL statement instead of read-modify-write: stations report the same frame concurrently.
function appendReception(db: Db, input: UplinkCallback, reception: Reception, now: Date): Promise<MessageRow> {
	const heard = sql`exists (select 1 from json_each(${messages.receptions}) where json_extract(value, '$.station') = ${reception.station})`;
	return db
		.update(messages)
		.set({
			receptions: sql`case when ${heard} then ${messages.receptions} else json_insert(${messages.receptions}, '$[#]', json(${JSON.stringify(reception)})) end`,
			updatedAt: sql`case when ${heard} then ${messages.updatedAt} else ${now.getTime()} end`,
		})
		.where(
			and(eq(messages.deviceId, input.device), eq(messages.seqNumber, input.seqNumber), eq(messages.time, input.time)),
		)
		.returning()
		.get() as Promise<MessageRow>;
}
