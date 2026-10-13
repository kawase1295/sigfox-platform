import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DEFAULT_MAP_STYLE_URL } from "#shared/config";
import { locationListSchema } from "#shared/locations";
import type { ParsedEntry } from "#shared/parsers";
import { parserSchema } from "#shared/parsers";
import { resolveConfig } from "../../src/worker/routes/config";
import { gpsPosition, sigfoxPosition } from "../../src/worker/services/locations";
import { api, createToken, json, randomHex } from "./helpers/api";

let bearer: string;
let gpsParserId: string;
beforeAll(async () => {
	bearer = `Bearer ${(await createToken("location tests")).secret}`;
	// Payload: lat and lng as signed 16-bit hundredths of a degree (enough to steer each test).
	const code = `
		const s16 = (h) => { const v = parseInt(h, 16); return v >= 0x8000 ? v - 0x10000 : v; };
		return [
			{ key: "lat", value: s16(payload.slice(0, 4)) / 100, type: "number" },
			{ key: "lng", value: s16(payload.slice(4, 8)) / 100, type: "number" },
		];`;
	const res = await api("/parsers", json("POST", { name: "GPS", code }));
	gpsParserId = parserSchema.parse(await res.json()).id;
});

const hex16 = (n: number) => ((Math.round(n * 100) + 0x10000) % 0x10000).toString(16).padStart(4, "0");

async function uplink(device: string, seqNumber: number, lat: number, lng: number, station = "1A2B") {
	const body = {
		device,
		time: 1_760_000_000 + seqNumber * 600,
		seqNumber,
		data: hex16(lat) + hex16(lng),
		station,
		rssi: -100,
		snr: 10,
	};
	expect((await api("/callbacks/sigfox/uplink", json("POST", body, { authorization: bearer }))).status).toBe(204);
}

async function gpsDevice() {
	const device = randomHex(6);
	await uplink(device, 0, 0.01, 0.01);
	expect((await api(`/devices/${device}`, json("PATCH", { parserId: gpsParserId }))).status).toBe(200);
	return device;
}

const trackOf = async (device: string, query = "") => {
	const res = await api(`/devices/${device}/locations${query}`);
	expect(res.status).toBe(200);
	return locationListSchema.parse(await res.json()).locations;
};

const entries = (values: Record<string, unknown>) =>
	Object.entries(values).map(([key, value]) => ({ key, value, type: "number" }) as ParsedEntry);

describe("gpsPosition", () => {
	it("reads lat, lng and an optional accuracy", () => {
		expect(gpsPosition(entries({ lat: 48.85, lng: 2.35 }))).toEqual({ lat: 48.85, lng: 2.35, accuracy: null });
		expect(gpsPosition(entries({ lat: -33.9, lng: 151.2, accuracy: 8 }))).toEqual({
			lat: -33.9,
			lng: 151.2,
			accuracy: 8,
		});
	});

	it.each([
		["no output", null],
		["missing lng", entries({ lat: 1 })],
		["latitude out of range", entries({ lat: 90.1, lng: 0 })],
		["longitude out of range", entries({ lat: 0, lng: -180.5 })],
		["a string value", entries({ lat: "48.85", lng: 2.35 })],
		["null island (no fix)", entries({ lat: 0, lng: 0 })],
	])("ignores %s", (_, parsed) => {
		expect(gpsPosition(parsed as ParsedEntry[] | null)).toBeNull();
	});
});

describe("sigfoxPosition", () => {
	it("accepts status 1 and 2 only", () => {
		const at = { lat: 35, lng: 139, radius: 2000, source: 2 };
		expect(sigfoxPosition({ ...at, status: 1 })).toEqual({ lat: 35, lng: 139, accuracy: 2000 });
		expect(sigfoxPosition({ ...at, status: 2 })).not.toBeNull();
		expect(sigfoxPosition({ ...at, status: 0 })).toBeNull();
		expect(sigfoxPosition(null)).toBeNull();
	});
});

describe("GPS locations from parser output", () => {
	it("creates one GPS location per message, even when stations redeliver it", async () => {
		const device = await gpsDevice();
		await uplink(device, 1, 35.68, 139.76);
		await uplink(device, 1, 35.68, 139.76, "BEEF");
		await uplink(device, 1, 35.68, 139.76);

		expect(await trackOf(device)).toMatchObject([{ lat: 35.68, lng: 139.76, accuracy: null, source: "gps" }]);
	});

	it("skips frames whose coordinates are out of range", async () => {
		const device = await gpsDevice();
		await uplink(device, 1, 95, 10);

		expect(await trackOf(device)).toEqual([]);
	});

	it("keeps GPS and Sigfox positions of the same frame and prefers GPS as the latest", async () => {
		const device = await gpsDevice();
		await uplink(device, 1, 10, 20);
		const advanced = {
			device,
			time: 1_760_000_600,
			seqNumber: 1,
			data: hex16(10) + hex16(20),
			computedLocation: { lat: 10.1, lng: 20.1, radius: 3000, source: 2, status: 1 },
		};
		expect((await api("/callbacks/sigfox/advanced", json("POST", advanced, { authorization: bearer }))).status).toBe(
			204,
		);

		expect((await trackOf(device)).map((l) => l.source).sort()).toEqual(["gps", "sigfox"]);
		const latest = locationListSchema.parse(await (await api("/locations/latest")).json()).locations;
		expect(latest.find((l) => l.deviceId === device)).toMatchObject({ source: "gps", lat: 10, lng: 20 });
	});
});

describe("locations API", () => {
	it("returns the latest position of each device that has one", async () => {
		const a = await gpsDevice();
		await uplink(a, 1, 1, 1);
		await uplink(a, 3, 3, 3);
		await uplink(a, 2, 2, 2);
		const silent = randomHex(6);
		await uplink(silent, 1, 5, 5);

		const latest = locationListSchema.parse(await (await api("/locations/latest")).json()).locations;
		expect(latest.filter((l) => l.deviceId === a)).toMatchObject([{ lat: 3, lng: 3 }]);
		expect(latest.some((l) => l.deviceId === silent)).toBe(false);
	});

	it("returns a device's track oldest first, limited to the newest points in range", async () => {
		const device = await gpsDevice();
		for (const seq of [1, 2, 3, 4]) await uplink(device, seq, seq, seq);
		const at = (seq: number) => new Date((1_760_000_000 + seq * 600) * 1000).toISOString();

		expect((await trackOf(device)).map((l) => l.lat)).toEqual([1, 2, 3, 4]);
		expect((await trackOf(device, "?limit=2")).map((l) => l.lat)).toEqual([3, 4]);
		expect((await trackOf(device, `?from=${at(2)}&to=${at(3)}`)).map((l) => l.lat)).toEqual([2, 3]);
	});

	it("rejects invalid queries and unknown devices", async () => {
		const device = await gpsDevice();
		expect((await api(`/devices/${device}/locations?limit=0`)).status).toBe(400);
		expect((await api(`/devices/${device}/locations?from=yesterday`)).status).toBe(400);
		expect((await api(`/devices/${device}/locations?from=2026-02-01T00:00:00Z&to=2026-01-01T00:00:00Z`)).status).toBe(
			400,
		);
		expect((await api(`/devices/${randomHex(6)}/locations`)).status).toBe(404);
	});

	it("deletes a message's locations with the message", async () => {
		const device = await gpsDevice();
		await uplink(device, 1, 1, 1);
		await env.DB.prepare("delete from messages where device_id = ?").bind(device).run();

		expect(await trackOf(device)).toEqual([]);
	});
});

describe("GET /api/config", () => {
	it("exposes the map style URL", async () => {
		const res = await api("/config");
		expect(await res.json()).toEqual({ mapStyleUrl: "https://tiles.openfreemap.org/styles/liberty" });
	});
});

describe("resolveConfig", () => {
	it("falls back to the default style when MAP_STYLE_URL is not a URL", () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(resolveConfig({ MAP_STYLE_URL: "not a url" }).mapStyleUrl).toBe(DEFAULT_MAP_STYLE_URL);
		expect(resolveConfig({ MAP_STYLE_URL: "https://example.com/style.json" }).mapStyleUrl).toBe(
			"https://example.com/style.json",
		);
		error.mockRestore();
	});
});
