import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { deviceSchema, messagePageSchema } from "#shared/devices";
import { invalidBodyResponseSchema } from "#shared/sigfox";
import { api, createToken, json, randomHex } from "./helpers/api";

let bearer: string;
beforeAll(async () => {
	bearer = `Bearer ${(await createToken("uplink tests")).secret}`;
});

const uplink = (body: unknown, authorization: string | null = bearer) =>
	api("/callbacks/sigfox/uplink", json("POST", body, authorization ? { authorization } : {}));

const callback = (over: Record<string, unknown> = {}) => ({
	device: randomHex(6),
	time: 1_760_000_000,
	seqNumber: 42,
	data: "0A1B2C",
	station: "1A2B",
	rssi: -120.5,
	snr: 12.34,
	...over,
});

const messagesOf = async (device: string) =>
	messagePageSchema.parse(await (await api(`/devices/${device}/messages`)).json()).messages;

describe("POST /api/callbacks/sigfox/uplink", () => {
	it("requires a bearer token", async () => {
		expect((await uplink(callback(), null)).status).toBe(401);
	});

	it("rejects an invalid body and names each invalid field", async () => {
		const res = await uplink({ device: "XYZ", time: "soon", seqNumber: 1, data: "abc", station: "1A2B", rssi: -1 });

		expect(res.status).toBe(400);
		const body = invalidBodyResponseSchema.parse(await res.json());
		expect(body.issues.map((i) => i.path).sort()).toEqual(["data", "device", "snr", "time"]);
	});

	it("auto-registers an unknown device and stores the message", async () => {
		const body = callback();
		expect((await uplink(body)).status).toBe(204);

		const device = deviceSchema.parse(await (await api(`/devices/${body.device}`)).json());
		expect(device).toMatchObject({ id: body.device, name: null, messageCount: 1 });
		expect(device.lastMessageAt).toBe(new Date(body.time * 1000).toISOString());
		expect(await messagesOf(body.device)).toMatchObject([
			{
				seqNumber: 42,
				time: new Date(body.time * 1000).toISOString(),
				data: "0a1b2c",
				receptions: [{ station: "1A2B", rssi: -120.5, snr: 12.34, source: "uplink" }],
			},
		]);
	});

	it("accepts numeric strings and normalizes ID case", async () => {
		const device = randomHex(7).toLowerCase();
		const res = await uplink(callback({ device, time: "1760000000", seqNumber: "7", rssi: "-99.00", snr: "8.50" }));

		expect(res.status).toBe(204);
		expect(await messagesOf(device.toUpperCase())).toMatchObject([
			{ seqNumber: 7, receptions: [{ rssi: -99, snr: 8.5 }] },
		]);
	});

	it("is idempotent for the same callback delivered twice", async () => {
		const body = callback();
		await uplink(body);
		await uplink(body);

		const messages = await messagesOf(body.device);
		expect(messages).toHaveLength(1);
		expect(messages[0]?.receptions).toHaveLength(1);
	});

	it("appends a duplicate reception from another station to the same message", async () => {
		const body = callback();
		await uplink(body);
		await uplink({ ...body, station: "BEEF", rssi: -130, snr: 5 });

		const messages = await messagesOf(body.device);
		expect(messages).toHaveLength(1);
		expect(messages[0]?.receptions.map((r) => r.station)).toEqual(["1A2B", "BEEF"]);
	});

	it("treats the same seqNumber at a different time as a new message", async () => {
		const body = callback();
		await uplink(body);
		await uplink({ ...body, time: body.time + 600 });

		expect(await messagesOf(body.device)).toHaveLength(2);
	});

	it("keeps lastMessageAt at the newest time when callbacks arrive out of order", async () => {
		const body = callback();
		await uplink({ ...body, time: body.time + 60, seqNumber: 43 });
		await uplink(body);

		const row = await env.DB.prepare("select last_message_at from devices where id = ?").bind(body.device).first();
		expect(row?.last_message_at).toBe((body.time + 60) * 1000);
	});
});
