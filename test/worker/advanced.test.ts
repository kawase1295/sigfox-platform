import { beforeAll, describe, expect, it } from "vitest";
import { deviceSchema, messagePageSchema } from "#shared/devices";
import { locationListSchema } from "#shared/locations";
import { invalidBodyResponseSchema } from "#shared/sigfox";
import { api, createToken, json, randomHex } from "./helpers/api";

let bearer: string;
beforeAll(async () => {
	bearer = `Bearer ${(await createToken("advanced tests")).secret}`;
});

const post = (path: string, body: unknown, authorization: string | null = bearer) =>
	api(`/callbacks/sigfox/${path}`, json("POST", body, authorization ? { authorization } : {}));

const frame = (over: Record<string, unknown> = {}) => ({
	device: randomHex(6),
	time: 1_760_000_000,
	seqNumber: 42,
	data: "0a1b2c",
	...over,
});

const advanced = (base: ReturnType<typeof frame>, over: Record<string, unknown> = {}) => ({
	...base,
	lqi: "Good",
	duplicates: [
		{ bsId: "1A2B", rssi: -120.5, snr: 12.3, nbRep: 3 },
		{ bsId: "beef", rssi: -130, nbRep: 1 },
	],
	computedLocation: { lat: 35.6812, lng: 139.7671, radius: 1500, source: 2, status: 1 },
	...over,
});

const uplink = (base: ReturnType<typeof frame>, station = "1A2B") => ({
	...base,
	station,
	rssi: -121,
	snr: 11,
});

const messagesOf = async (device: string) =>
	messagePageSchema.parse(await (await api(`/devices/${device}/messages`)).json()).messages;

const trackOf = async (device: string, query = "") =>
	locationListSchema.parse(await (await api(`/devices/${device}/locations${query}`)).json()).locations;

describe("POST /api/callbacks/sigfox/advanced", () => {
	it("requires a bearer token", async () => {
		expect((await post("advanced", advanced(frame()), null)).status).toBe(401);
	});

	it("rejects an invalid body and names each invalid field", async () => {
		const res = await post("advanced", { ...advanced(frame()), seqNumber: "x", lqi: "SUPERB", duplicates: [{}] });

		expect(res.status).toBe(400);
		const paths = invalidBodyResponseSchema.parse(await res.json()).issues.map((i) => i.path);
		expect(paths).toEqual(expect.arrayContaining(["seqNumber", "lqi", "duplicates.0.bsId"]));
	});

	it("stores an advanced-only frame as a message with its stations, lqi and Sigfox location", async () => {
		const base = frame();
		expect((await post("advanced", advanced(base))).status).toBe(204);

		const device = deviceSchema.parse(await (await api(`/devices/${base.device}`)).json());
		expect(device.messageCount).toBe(1);
		expect(await messagesOf(base.device)).toMatchObject([
			{
				seqNumber: 42,
				data: "0a1b2c",
				lqi: "GOOD",
				receptions: [
					{ station: "1A2B", rssi: -120.5, snr: 12.3, nbRep: 3, source: "advanced" },
					{ station: "BEEF", rssi: -130, nbRep: 1, source: "advanced" },
				],
			},
		]);
		expect(await trackOf(base.device)).toMatchObject([
			{ lat: 35.6812, lng: 139.7671, accuracy: 1500, source: "sigfox", time: new Date(base.time * 1000).toISOString() },
		]);
	});

	it("merges a later uplink into the advanced message without double-counting stations", async () => {
		const base = frame();
		await post("advanced", advanced(base));
		await post("uplink", uplink(base, "1A2B"));
		await post("uplink", uplink(base, "CAFE"));

		const [message, ...rest] = await messagesOf(base.device);
		expect(rest).toEqual([]);
		expect(message?.receptions).toEqual([
			{ station: "1A2B", rssi: -121, snr: 11, nbRep: 3, source: "uplink" },
			{ station: "BEEF", rssi: -130, nbRep: 1, source: "advanced" },
			{ station: "CAFE", rssi: -121, snr: 11, source: "uplink" },
		]);
	});

	it("merges advanced into an existing uplink message, keeping the uplink measurements", async () => {
		const base = frame();
		await post("uplink", uplink(base, "1A2B"));
		await post("advanced", advanced(base));
		await post("advanced", advanced(base));

		const messages = await messagesOf(base.device);
		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({
			lqi: "GOOD",
			receptions: [
				{ station: "1A2B", rssi: -121, snr: 11, nbRep: 3, source: "uplink" },
				{ station: "BEEF", source: "advanced" },
			],
		});
		expect(await trackOf(base.device)).toHaveLength(1);
	});

	it("keeps every station when callbacks for one frame arrive concurrently", async () => {
		const base = frame();
		await post("uplink", uplink(base, "0001"));
		const stations = ["0002", "0003", "0004", "0005", "0006"];
		await Promise.all([...stations.map((s) => post("uplink", uplink(base, s))), post("advanced", advanced(base))]);

		const [message] = await messagesOf(base.device);
		expect(message?.receptions.map((r) => r.station).sort()).toEqual(["0001", ...stations, "1A2B", "BEEF"].sort());
	});

	it("accepts quoted JSON variables and missing optional ones", async () => {
		const base = frame();
		const quoted = advanced(base, {
			duplicates: JSON.stringify([{ bsId: "1A2B", rssi: "-100", nbRep: "2" }]),
			computedLocation: JSON.stringify({ lat: 1.5, lng: 2.5, radius: 10, source: 2, status: 1 }),
		});
		expect((await post("advanced", quoted)).status).toBe(204);
		expect((await post("advanced", { ...frame(), lqi: undefined })).status).toBe(204);

		expect(await trackOf(base.device)).toMatchObject([{ lat: 1.5, lng: 2.5 }]);
	});

	it.each([
		["status 0 (no position)", { lat: 35, lng: 139, radius: 1000, source: 2, status: 0 }],
		["status 20 (invalid payload)", { lat: 35, lng: 139, radius: 1000, source: 2, status: 20 }],
		["out-of-range latitude", { lat: 95, lng: 139, radius: 1000, source: 2, status: 1 }],
		["null", null],
	])("stores the message but no location for %s", async (_, computedLocation) => {
		const base = frame();
		expect((await post("advanced", advanced(base, { computedLocation }))).status).toBe(204);

		expect(await messagesOf(base.device)).toHaveLength(1);
		expect(await trackOf(base.device)).toEqual([]);
	});
});
