import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { Device, Message, MessagePage } from "#shared/devices";
import type { RealtimeEvent } from "#shared/realtime";

// Mirrors the keys used by routes/devices.tsx and routes/device.tsx; the shell tests catch drift.
export const deviceKeys = {
	all: ["devices"] as const,
	detail: (id: string) => ["devices", id] as const,
	messages: (id: string) => ["devices", id, "messages"] as const,
};

type MessagePages = InfiniteData<MessagePage, string | null>;

/** Folds one server event into the query cache. Only caches that already exist are touched. */
export function applyRealtimeEvent(client: QueryClient, event: RealtimeEvent): void {
	switch (event.type) {
		case "device.upserted":
			client.setQueryData<Device[]>(deviceKeys.all, (list) => list && upsertDevice(list, event.device));
			client.setQueryData<Device>(deviceKeys.detail(event.device.id), (old) => old && event.device);
			return;
		case "message.upserted":
			client.setQueryData<MessagePages>(deviceKeys.messages(event.deviceId), (old) =>
				old ? upsertMessage(old, event.message) : old,
			);
			return;
		case "location.created":
			// Why ignored: no location queries exist yet; the map (#9) adds its cache handling here.
			return;
	}
}

// Same order as the API: newest lastMessageAt first, never-heard devices last, then by id.
const deviceOrder = (a: Device, b: Device) =>
	(b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "") || a.id.localeCompare(b.id);

const upsertDevice = (list: Device[], device: Device) =>
	[...list.filter((d) => d.id !== device.id), device].sort(deviceOrder);

// Same order as the API: (time, id) descending.
const isNewer = (a: Message, b: Message) => a.time > b.time || (a.time === b.time && a.id > b.id);

function upsertMessage(data: MessagePages, message: Message): MessagePages {
	const known = data.pages.some((p) => p.messages.some((m) => m.id === message.id));
	if (known) {
		return {
			...data,
			pages: data.pages.map((p) => ({ ...p, messages: p.messages.map((m) => (m.id === message.id ? message : m)) })),
		};
	}

	const [first, ...rest] = data.pages;
	if (!first) return data;
	const last = first.messages.at(-1);
	// Why not insert everywhere: an older frame below the first page arrives with that page's cursor fetch.
	if (first.nextCursor !== null && last && !isNewer(message, last)) return data;
	const at = first.messages.findIndex((m) => isNewer(message, m));
	const messages = [...first.messages];
	messages.splice(at === -1 ? messages.length : at, 0, message);
	return { ...data, pages: [{ ...first, messages }, ...rest] };
}
