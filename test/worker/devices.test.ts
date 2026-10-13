import { beforeAll, describe, expect, it } from "vitest";
import { deviceListSchema, deviceSchema, messagePageSchema } from "#shared/devices";
import { api, createToken, json, randomHex } from "./helpers/api";

let bearer: string;
beforeAll(async () => {
	bearer = `Bearer ${(await createToken("device tests")).secret}`;
});

async function ingest(device: string, seqNumber: number, time: number) {
	const body = { device, time, seqNumber, data: "00", station: "1A2B", rssi: -100, snr: 10 };
	const res = await api("/callbacks/sigfox/uplink", json("POST", body, { authorization: bearer }));
	expect(res.status).toBe(204);
}

const page = async (device: string, query: string) => {
	const res = await api(`/devices/${device}/messages${query}`);
	expect(res.status).toBe(200);
	return messagePageSchema.parse(await res.json());
};

describe("devices API", () => {
	it("lists devices with their message count", async () => {
		const device = randomHex(6);
		await ingest(device, 1, 1_760_000_000);
		await ingest(device, 2, 1_760_000_600);

		const { devices } = deviceListSchema.parse(await (await api("/devices")).json());
		expect(devices.find((d) => d.id === device)).toMatchObject({ messageCount: 2 });
	});

	it("pages messages newest first with a cursor", async () => {
		const device = randomHex(6);
		for (let seq = 1; seq <= 5; seq++) await ingest(device, seq, 1_760_000_000 + seq * 600);

		const first = await page(device, "?limit=2");
		expect(first.messages.map((m) => m.seqNumber)).toEqual([5, 4]);
		expect(first.nextCursor).not.toBeNull();

		const second = await page(device, `?limit=2&cursor=${encodeURIComponent(first.nextCursor ?? "")}`);
		expect(second.messages.map((m) => m.seqNumber)).toEqual([3, 2]);

		const last = await page(device, `?limit=2&cursor=${encodeURIComponent(second.nextCursor ?? "")}`);
		expect(last.messages.map((m) => m.seqNumber)).toEqual([1]);
		expect(last.nextCursor).toBeNull();
	});

	it("rejects a malformed cursor or limit", async () => {
		const device = randomHex(6);
		await ingest(device, 1, 1_760_000_000);
		expect((await api(`/devices/${device}/messages?cursor=nope`)).status).toBe(400);
		expect((await api(`/devices/${device}/messages?limit=0`)).status).toBe(400);
	});

	it("returns 404 for an unknown device", async () => {
		expect((await api(`/devices/${randomHex(8)}`)).status).toBe(404);
		expect((await api(`/devices/${randomHex(8)}/messages`)).status).toBe(404);
		expect((await api(`/devices/${randomHex(8)}`, json("PATCH", { name: "x" }))).status).toBe(404);
	});

	it("renames a device and clears the name with an empty string", async () => {
		const device = randomHex(6);
		await ingest(device, 1, 1_760_000_000);

		const renamed = await api(`/devices/${device.toLowerCase()}`, json("PATCH", { name: " Tracker " }));
		expect(deviceSchema.parse(await renamed.json()).name).toBe("Tracker");

		const cleared = await api(`/devices/${device}`, json("PATCH", { name: "" }));
		expect(deviceSchema.parse(await cleared.json()).name).toBeNull();
	});

	it("is protected by Access, not by API tokens", async () => {
		expect((await api("/devices", { headers: { authorization: bearer } })).status).toBe(200);
		expect((await api("/callbacks/sigfox/uplink", json("POST", {}))).status).toBe(401);
	});
});
