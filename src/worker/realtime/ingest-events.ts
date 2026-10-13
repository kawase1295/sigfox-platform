import type { RealtimeEvent } from "#shared/realtime";
import type { Db } from "../db/client";
import { getDevice, toMessage } from "../db/devices";
import { type LocationRow, toLocation } from "../db/locations";
import type { IngestResult } from "../services/ingest";
import { publish } from "./publish";

/** Events that make browsers match the database after one ingest; none for a redelivery. */
export async function ingestEvents(
	db: Db,
	result: IngestResult,
	locations: LocationRow[] = [],
): Promise<RealtimeEvent[]> {
	const events: RealtimeEvent[] = [];
	if (result.changed) {
		// Why only on a new message: an extra reception changes neither the count nor lastMessageAt.
		if (result.created) {
			const device = await getDevice(db, result.device.id);
			if (device) events.push({ type: "device.upserted", device });
		}
		events.push({ type: "message.upserted", deviceId: result.device.id, message: toMessage(result.message) });
	}
	// After the message so a client that follows the link to the message finds it.
	for (const location of locations) events.push({ type: "location.created", location: toLocation(location) });
	return events;
}

/** Publishes the ingest's events in order. Never rejects, so callers can hand it to waitUntil. */
export async function publishIngest(
	env: Pick<Env, "REALTIME">,
	db: Db,
	result: IngestResult,
	locations: LocationRow[] = [],
): Promise<void> {
	try {
		for (const event of await ingestEvents(db, result, locations)) await publish(env, event);
	} catch (error) {
		console.error("realtime publish after ingest failed", error);
	}
}
