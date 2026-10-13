import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { communicationLost, deviceListSchema, deviceSchema } from "#shared/devices";
import type { RealtimeEvent } from "#shared/realtime";
import { invalidBodyResponseSchema } from "#shared/sigfox";
import { createApp } from "../../src/worker/app";
import { realtimeHub } from "../../src/worker/realtime/publish";
import { PURGE_TARGETS, purgeExpired } from "../../src/worker/services/retention";
import { api, createToken, json, randomHex } from "./helpers/api";
import { acceptSocket, type TestSocket, upgradeHeaders } from "./helpers/ws";

let bearer: string;
beforeAll(async () => {
	bearer = `Bearer ${(await createToken("error callback tests")).secret}`;
});

// Why app.request with our own context: waiting on waitUntil makes "nothing was published" decidable.
const app = createApp();
async function post(type: string, body: unknown, authorization: string | null = bearer) {
	const ctx = createExecutionContext();
	const init = json("POST", body, authorization ? { authorization } : {});
	const res = await app.request(`http://localhost/api/callbacks/sigfox/${type}`, init, env, ctx);
	await waitOnExecutionContext(ctx);
	return res;
}

const errorCallback = (over: Record<string, unknown> = {}) => ({
	device: randomHex(6),
	time: 1_760_000_000,
	info: "Communication loss since 2025-10-09 08:53:20",
	severity: "ERROR",
	...over,
});

const deviceOf = async (id: string) => deviceSchema.parse(await (await api(`/devices/${id}`)).json());

describe("POST /api/callbacks/sigfox/error", () => {
	it("requires a bearer token", async () => {
		expect((await post("error", errorCallback(), null)).status).toBe(401);
	});

	it("rejects an invalid body and names each invalid field", async () => {
		const res = await post("error", { device: "XYZ", time: "soon", severity: "ERROR" });

		expect(res.status).toBe(400);
		const body = invalidBodyResponseSchema.parse(await res.json());
		expect(body.issues.map((i) => i.path).sort()).toEqual(["device", "info", "time"]);
	});

	it("auto-registers an unknown device without inventing a message", async () => {
		const body = errorCallback({ time: "1760000000", device: randomHex(7).toLowerCase() });
		expect((await post("error", body)).status).toBe(204);

		const device = await deviceOf(body.device.toUpperCase());
		expect(device).toMatchObject({
			messageCount: 0,
			lastMessageAt: null,
			lastError: { time: new Date(1_760_000_000_000).toISOString(), severity: "ERROR", info: body.info },
		});
		expect(communicationLost(device)).toBe(true);
	});

	it("reports the newest error even when callbacks arrive out of order", async () => {
		const body = errorCallback();
		await post("error", { ...body, time: body.time + 3600, info: "newer" });
		await post("error", body);

		expect((await deviceOf(body.device)).lastError?.info).toBe("newer");
	});

	it("stores a redelivered error once", async () => {
		const body = errorCallback();
		await post("error", body);
		await post("error", body);

		const row = await env.DB.prepare("select count(*) as n from device_events where device_id = ?")
			.bind(body.device)
			.first();
		expect(row?.n).toBe(1);
	});

	it("clears the lost state once a later message arrives", async () => {
		const body = errorCallback();
		await post("error", body);
		const uplink = {
			device: body.device,
			time: body.time + 60,
			seqNumber: 1,
			data: "",
			station: "1A2B",
			rssi: -120,
			snr: 5,
		};
		expect((await post("uplink", uplink)).status).toBe(204);

		const device = await deviceOf(body.device);
		expect(device.lastError?.info).toBe(body.info);
		expect(communicationLost(device)).toBe(false);
	});

	it("includes the last error in the device list", async () => {
		const body = errorCallback();
		await post("error", body);

		const { devices } = deviceListSchema.parse(await (await api("/devices")).json());
		expect(devices.find((d) => d.id === body.device)?.lastError?.severity).toBe("ERROR");
	});
});

describe("error callback realtime events", () => {
	let socket: TestSocket;
	beforeEach(async () => {
		socket = acceptSocket(await realtimeHub(env).fetch("http://hub/", { headers: upgradeHeaders }));
	});
	afterEach(() => socket.close());

	/** Events about `deviceId` published before a fresh sentinel broadcast. */
	async function drain(deviceId: string): Promise<RealtimeEvent[]> {
		const sentinel = `SENTINEL-${crypto.randomUUID()}`;
		await realtimeHub(env).broadcast({ type: "device.upserted", device: { id: sentinel } as never });
		const frames: RealtimeEvent[] = [];
		for (;;) {
			const frame = (await socket.next()) as RealtimeEvent;
			if (frame.type !== "device.upserted") continue;
			if (frame.device.id === sentinel) return frames;
			if (frame.device.id === deviceId) frames.push(frame);
		}
	}

	it("publishes the device with its new error, and nothing for a redelivery", async () => {
		const body = errorCallback();
		await post("error", body);
		await post("error", body);

		expect(await drain(body.device)).toMatchObject([
			{ type: "device.upserted", device: { id: body.device, lastError: { info: body.info } } },
		]);
	});
});

describe("retention", () => {
	it("purges expired device events", async () => {
		// Why 2008: newer than retention.test.ts's purge window (2001), so its parallel purges cannot take this row,
		// and only this target is purged, so other tests' events (2025) and data stay put in the shared D1.
		const body = errorCallback({ time: 1_200_000_000 });
		await post("error", body);

		const targets = PURGE_TARGETS.filter((t) => t.name === "device_events");
		expect(targets).toHaveLength(1);
		const result = await purgeExpired(env.DB, { days: 1, now: new Date(1_300_000_000_000), targets });

		expect(result.deleted.device_events).toBeGreaterThanOrEqual(1);
		expect((await deviceOf(body.device)).lastError).toBeNull();
	});
});
