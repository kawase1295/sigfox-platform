import { and, desc, eq, getTableColumns, lt, or, sql } from "drizzle-orm";
import type { Device, Message } from "#shared/devices";
import type { Db } from "./client";
import { devices, messages } from "./schema";

export type DeviceRow = typeof devices.$inferSelect;
export type MessageRow = typeof messages.$inferSelect;

// Why the raw qualified name: drizzle renders ${devices.id} unqualified, which would bind to messages.id here.
const messageCount = sql<number>`(select count(*) from ${messages} m where m.device_id = "devices"."id")`;

export const toDevice = (r: DeviceRow & { messageCount: number }): Device => ({
	id: r.id,
	name: r.name,
	createdAt: r.createdAt.toISOString(),
	lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
	messageCount: r.messageCount,
});

export const toMessage = (r: MessageRow): Message => ({
	id: r.id,
	deviceId: r.deviceId,
	time: new Date(r.time * 1000).toISOString(),
	seqNumber: r.seqNumber,
	data: r.data,
	receptions: r.receptions,
	createdAt: r.createdAt.toISOString(),
	updatedAt: r.updatedAt.toISOString(),
});

export async function listDevices(db: Db): Promise<Device[]> {
	const rows = await db
		.select({ ...getTableColumns(devices), messageCount })
		.from(devices)
		.orderBy(sql`${devices.lastMessageAt} desc nulls last`, devices.id);
	return rows.map(toDevice);
}

export async function getDevice(db: Db, id: string): Promise<Device | null> {
	const row = await db
		.select({ ...getTableColumns(devices), messageCount })
		.from(devices)
		.where(eq(devices.id, id))
		.get();
	return row ? toDevice(row) : null;
}

export async function renameDevice(db: Db, id: string, name: string | null): Promise<Device | null> {
	const row = await db.update(devices).set({ name }).where(eq(devices.id, id)).returning({ id: devices.id }).get();
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
