import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { RealtimeEvent } from "#shared/realtime";
import { createApp } from "../../src/worker/app";
import { realtimeHub } from "../../src/worker/realtime/publish";
import { createToken, json, randomHex } from "./helpers/api";
import { acceptSocket, type TestSocket, upgradeHeaders } from "./helpers/ws";

let bearer: string;
beforeAll(async () => {
	bearer = `Bearer ${(await createToken("uplink realtime tests")).secret}`;
});

const hub = () => realtimeHub(env);
let socket: TestSocket;
beforeEach(async () => {
	socket = acceptSocket(await hub().fetch("http://hub/", { headers: upgradeHeaders }));
});
afterEach(() => socket.close());

// Why app.request with our own context: waiting on waitUntil makes "nothing was published" decidable.
const app = createApp();
async function uplink(body: unknown, bindings: Env = env) {
	const ctx = createExecutionContext();
	const init = json("POST", body, { authorization: bearer });
	const res = await app.request("http://localhost/api/callbacks/sigfox/uplink", init, bindings, ctx);
	await waitOnExecutionContext(ctx);
	return res;
}

const callback = (over: Record<string, unknown> = {}) => ({
	device: randomHex(6),
	time: 1_760_000_000,
	seqNumber: 1,
	data: "0a",
	station: "1A2B",
	rssi: -120,
	snr: 10,
	...over,
});

const aboutDevice = (e: RealtimeEvent, id: string) =>
	e.type === "message.upserted" ? e.deviceId === id : e.type === "device.upserted" ? e.device.id === id : false;

/**
 * Events about `deviceId` received before a fresh sentinel broadcast, i.e. exactly what earlier
 * requests published. Filtering by device keeps other test files sharing the hub out.
 */
async function drain(deviceId: string): Promise<RealtimeEvent[]> {
	const sentinel = `SENTINEL-${crypto.randomUUID()}`;
	await hub().broadcast({ type: "device.upserted", device: { id: sentinel } as never });
	const frames: RealtimeEvent[] = [];
	for (;;) {
		const frame = (await socket.next()) as RealtimeEvent;
		if (aboutDevice(frame, sentinel)) return frames;
		if (aboutDevice(frame, deviceId)) frames.push(frame);
	}
}

describe("uplink callback realtime events", () => {
	it("publishes the new device, then the message", async () => {
		const body = callback();
		expect((await uplink(body)).status).toBe(204);

		expect(await drain(body.device)).toMatchObject([
			{ type: "device.upserted", device: { id: body.device, messageCount: 1 } },
			{ type: "message.upserted", deviceId: body.device, message: { seqNumber: 1 } },
		]);
	});

	it("publishes only the message when another station adds a reception", async () => {
		const body = callback();
		await uplink(body);
		await drain(body.device);

		await uplink({ ...body, station: "BEEF" });

		const events = await drain(body.device);
		expect(events.map((e) => e.type)).toEqual(["message.upserted"]);
		expect(events[0]).toMatchObject({ message: { receptions: [{ station: "1A2B" }, { station: "BEEF" }] } });
	});

	it("publishes nothing for an exact redelivery", async () => {
		const body = callback();
		await uplink(body);
		await drain(body.device);

		await uplink(body);

		expect(await drain(body.device)).toEqual([]);
	});

	it("still accepts the callback when the hub is unreachable", async () => {
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		const broken = {
			...env,
			REALTIME: {
				getByName: () => {
					throw new Error("hub down");
				},
			},
		} as unknown as Env;

		expect((await uplink(callback(), broken)).status).toBe(204);
		expect(error).toHaveBeenCalled();
		error.mockRestore();
	});
});
