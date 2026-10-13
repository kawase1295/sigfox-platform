import type { ErrorCallback } from "#shared/sigfox";
import type { Db } from "../db/client";
import { deviceEvents, devices } from "../db/schema";

/** Stores one ERROR callback. `created` is false for a redelivery of an event already stored. */
export async function ingestError(db: Db, input: ErrorCallback, now = new Date()): Promise<{ created: boolean }> {
	// Why no lastMessageAt: an ERROR callback reports silence, so it must not count as hearing from the device.
	const register = db.insert(devices).values({ id: input.device, createdAt: now }).onConflictDoNothing();
	const insert = db
		.insert(deviceEvents)
		.values({ deviceId: input.device, time: input.time, severity: input.severity, info: input.info, createdAt: now })
		.onConflictDoNothing()
		.returning({ id: deviceEvents.id });
	const [, inserted] = await db.batch([register, insert]);
	return { created: inserted.length > 0 };
}
