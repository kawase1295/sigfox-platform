import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Location } from "#shared/locations";
import type { Db } from "./client";
import { locations } from "./schema";

export type LocationRow = typeof locations.$inferSelect;

export const toLocation = (r: LocationRow): Location => ({
	id: r.id,
	deviceId: r.deviceId,
	messageId: r.messageId,
	time: new Date(r.time * 1000).toISOString(),
	lat: r.lat,
	lng: r.lng,
	accuracy: r.accuracy,
	source: r.source,
});

const toSeconds = (iso: string) => Math.floor(Date.parse(iso) / 1000);

/**
 * Newest position per device. Within one frame a GPS fix wins over the Sigfox estimate, which arrives later
 * (DATA_ADVANCED) but is far less precise.
 */
export async function latestLocations(db: Db): Promise<Location[]> {
	// Why per device: one indexed lookup each, instead of ranking every stored position.
	const newestPerDevice = sql`select (
		select l.id from locations l where l.device_id = d.id
		order by l.time desc, case l.source when 'gps' then 0 else 1 end, l.id desc limit 1
	) from devices d`;
	const rows = await db
		.select()
		.from(locations)
		.where(sql`${locations.id} in (${newestPerDevice})`)
		.orderBy(locations.deviceId);
	return rows.map(toLocation);
}

export async function listTrack(
	db: Db,
	deviceId: string,
	{ from, to, limit }: { from?: string; to?: string; limit: number },
): Promise<Location[]> {
	const rows = await db
		.select()
		.from(locations)
		.where(
			and(
				eq(locations.deviceId, deviceId),
				from ? gte(locations.time, toSeconds(from)) : undefined,
				to ? lte(locations.time, toSeconds(to)) : undefined,
			),
		)
		.orderBy(desc(locations.time), desc(locations.id))
		.limit(limit);
	return rows.reverse().map(toLocation);
}
