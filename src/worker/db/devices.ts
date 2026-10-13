import { and, desc, eq, getTableColumns, lt, or, sql } from "drizzle-orm";
import type { Device, DeviceError, Message } from "#shared/devices";
import type { Db } from "./client";
import { deviceEvents, devices, messages } from "./schema";

export type DeviceRow = typeof devices.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;

// Why the raw qualified name: drizzle renders ${devices.id} unqualified, which would bind to messages.id here.
const messageCount = sql<number>`(select count(*) from ${messages} m where m.device_id = "devices"."id")`;

// Newest event by time, so redelivered or out-of-order callbacks cannot hide a later one. Time is epoch seconds.
const lastError = sql<
	string | null
>`(select json_object('time', e.time, 'severity', e.severity, 'info', e.info) from ${deviceEvents} e where e.device_id = "devices"."id" order by e.time desc limit 1)`;

type StoredError = { time: number; severity: string; info: string };

const toDeviceError = (raw: string | null): DeviceError | null => {
	if (raw === null) return null;
	const e = JSON.parse(raw) as StoredError;
	return { time: new Date(e.time * 1000).toISOString(), severity: e.severity, info: e.info };
};

const deviceColumns = { ...getTableColumns(devices), messageCount, lastError };

export const toDevice = (r: DeviceRow & { messageCount: number; lastError: string | null }): Device => ({
	id: r.id,
	name: r.name,
	createdAt: r.createdAt.toISOString(),
	lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
	messageCount: r.messageCount,
	parserId: r.parserId,
	lastError: toDeviceError(r.lastError),
});

export const toMessage = (r: MessageRow): Message => ({
	id: r.id,
	deviceId: r.deviceId,
	time: new Date(r.time * 1000).toISOString(),
	seqNumber: r.seqNumber,
	data: r.data,
	receptions: r.receptions,
	lqi: r.lqi,
	createdAt: r.createdAt.toISOString(),
	updatedAt: r.updatedAt.toISOString(),
	parsed: r.parsed,
	parseError: r.parseError,
});

export async function listDevices(db: Db): Promise<Device[]> {
	const rows = await db
		.select(deviceColumns)
		.from(devices)
		.orderBy(sql`${devices.lastMessageAt} desc nulls last`, devices.id);
	return rows.map(toDevice);
}

export async function getDevice(db: Db, id: string): Promise<Device | null> {
	const row = await db.select(deviceColumns).from(devices).where(eq(devices.id, id)).get();
	return row ? toDevice(row) : null;
}

export async function updateDevice(
	db: Db,
	id: string,
	changes: { name?: string | null; parserId?: string | null },
): Promise<Device | null> {
	const row = await db.update(devices).set(changes).where(eq(devices.id, id)).returning({ id: devices.id }).get();
	return row ? getDevice(db, id) : null;
}

/** Cursor = `<time>.<id>` of the last row on the previous page; (time, id) is a total order. */
export type MessageCursor = { time: number; id: number };

export const encodeCursor = (c: MessageCursor) => `${c.time}.${c.id}`;

export function decodeCursor(raw: string): MessageCursor | null {
	const m = /^(\d+)\.(\d+)$/.exec(raw);
	return m ? { time: Number(m[1]), id: Number(m[2]) } : null;
}

export async function listMessages(
	db: Db,
	deviceId: string,
	{ cursor, limit }: { cursor: MessageCursor | null; limit: number },
): Promise<{ messages: Message[]; nextCursor: string | null }> {
	const rows = await db
		.select()
		.from(messages)
		.where(
			and(
				eq(messages.deviceId, deviceId),
				cursor
					? or(lt(messages.time, cursor.time), and(eq(messages.time, cursor.time), lt(messages.id, cursor.id)))
					: undefined,
			),
		)
		.orderBy(desc(messages.time), desc(messages.id))
		.limit(limit + 1);
	const pageRows = rows.slice(0, limit);
	const last = pageRows.at(-1);
	return {
		messages: pageRows.map(toMessage),
		nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
	};
}
