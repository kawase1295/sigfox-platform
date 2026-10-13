import { describe, expect, it } from "vitest";
import type { Device, Message } from "#shared/devices";
import { type RealtimeEvent, realtimeEventSchema } from "#shared/realtime";

const device: Device = {
	id: "1A2B3C",
	name: null,
	createdAt: "2026-10-01T00:00:00.000Z",
	lastMessageAt: "2026-10-01T00:10:00.000Z",
	messageCount: 1,
};

const message: Message = {
	id: 1,
	deviceId: "1A2B3C",
	time: "2026-10-01T00:10:00.000Z",
	seqNumber: 7,
	data: "0a",
	receptions: [{ station: "AAAA", rssi: -120, snr: 10, source: "uplink" }],
	createdAt: "2026-10-01T00:10:00.000Z",
	updatedAt: "2026-10-01T00:10:00.000Z",
};

describe("realtimeEventSchema", () => {
	it.each<RealtimeEvent>([
		{ type: "message.upserted", deviceId: "1A2B3C", message },
		{ type: "device.upserted", device },
		{
			type: "location.created",
			location: { deviceId: "1A2B3C", time: "2026-10-01T00:10:00.000Z", lat: 35.68, lng: 139.76, source: "parser" },
		},
	])("accepts $type", (event) => {
		expect(realtimeEventSchema.parse(JSON.parse(JSON.stringify(event)))).toEqual(event);
	});

	it("rejects unknown event types", () => {
		expect(realtimeEventSchema.safeParse({ type: "device.deleted", device }).success).toBe(false);
	});

	it("rejects a payload that does not match its type", () => {
		expect(realtimeEventSchema.safeParse({ type: "device.upserted", message }).success).toBe(false);
	});

	it("rejects out-of-range coordinates", () => {
		const location = { deviceId: "1A2B3C", time: "2026-10-01T00:10:00.000Z", lat: 91, lng: 0, source: "sigfox" };
		expect(realtimeEventSchema.safeParse({ type: "location.created", location }).success).toBe(false);
	});
});
