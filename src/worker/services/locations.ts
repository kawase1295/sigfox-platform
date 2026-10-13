import type { LocationSource } from "#shared/locations";
import type { ParsedEntry } from "#shared/parsers";
import type { ComputedLocation } from "#shared/sigfox";
import type { Db } from "../db/client";
import type { MessageRow } from "../db/devices";
import type { LocationRow } from "../db/locations";
import { locations } from "../db/schema";

export type Position = { lat: number; lng: number; accuracy: number | null };

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function position(lat: unknown, lng: unknown, accuracy: unknown): Position | null {
	if (!finite(lat) || !finite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
	// Why reject 0,0: trackers without a fix commonly report it, and nobody tracks devices in the Gulf of Guinea.
	if (lat === 0 && lng === 0) return null;
	return { lat, lng, accuracy: finite(accuracy) && accuracy >= 0 ? accuracy : null };
}

/** DATA_ADVANCED computedLocation; statuses 1 (OK) and 2 (WiFi fallback) carry a position. */
export function sigfoxPosition(computed: ComputedLocation | null | undefined): Position | null {
	if (!computed || (computed.status !== 1 && computed.status !== 2)) return null;
	return position(computed.lat, computed.lng, computed.radius);
}

/** Parser output with numeric `lat` and `lng` (the legacy platform's keys), plus an optional `accuracy` in metres. */
export function gpsPosition(parsed: ParsedEntry[] | null): Position | null {
	if (!parsed) return null;
	const value = (key: string) => parsed.find((e) => e.key === key)?.value;
	return position(value("lat"), value("lng"), value("accuracy"));
}

/** Stores a position once per message and source; returns null when it was already stored. */
export async function recordLocation(
	db: Db,
	message: MessageRow,
	source: LocationSource,
	at: Position,
	now = new Date(),
): Promise<LocationRow | null> {
	const row = await db
		.insert(locations)
		.values({ deviceId: message.deviceId, messageId: message.id, time: message.time, source, ...at, createdAt: now })
		.onConflictDoNothing()
		.returning()
		.get();
	return row ?? null;
}
