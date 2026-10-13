import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import type { RealtimeEvent } from "#shared/realtime";
import { createApp } from "../../src/worker/app";
import { realtimeHub } from "../../src/worker/realtime/publish";
import { accessEnv, createAccessIssuer } from "./helpers/access";
import { api, randomHex } from "./helpers/api";
import { acceptSocket, type TestSocket, upgradeHeaders } from "./helpers/ws";

type DeviceEvent = Extract<RealtimeEvent, { type: "device.upserted" }>;
const deviceEvent = (id = randomHex(8)): DeviceEvent => ({
	type: "device.upserted",
	device: {
		id,
		name: null,
		createdAt: "2026-10-01T00:00:00.000Z",
		lastMessageAt: null,
		messageCount: 0,
		parserId: null,
	},
});

let sockets: TestSocket[] = [];
const open = async (res: Promise<Response>) => {
	const socket = acceptSocket(await res);
	sockets.push(socket);
	return socket;
};

afterEach(() => {
	for (const s of sockets) s.close();
	sockets = [];
});

describe("RealtimeHub", () => {
	// Why a private instance per test: other test files publish to the global scope concurrently.
	const privateHub = () => realtimeHub(env, `test-${crypto.randomUUID()}`);
	const connect = (hub: ReturnType<typeof privateHub>) => open(hub.fetch("http://hub/", { headers: upgradeHeaders }));

	it("fans a broadcast out to every connected socket", async () => {
		const hub = privateHub();
		const a = await connect(hub);
		const b = await connect(hub);
		const event = deviceEvent();

		expect(await hub.broadcast(event)).toBe(2);
		expect(await a.next()).toEqual(event);
		expect(await b.next()).toEqual(event);
	});

	it("stops sending to a socket once it is closed", async () => {
		const hub = privateHub();
		const a = await connect(hub);
		const b = await connect(hub);

		a.close();

		await expect.poll(() => hub.broadcast(deviceEvent())).toBe(1);
		expect(await b.next()).toMatchObject({ type: "device.upserted" });
	});

	it("rejects requests that are not WebSocket upgrades", async () => {
		expect((await privateHub().fetch("http://hub/")).status).toBe(426);
	});
});

describe("GET /api/realtime", () => {
	// The api() helper requests http://localhost, so this is what a browser on the app would send.
	const sameOrigin = { ...upgradeHeaders, Origin: "http://localhost" };

	it("requires Cloudflare Access like the rest of the API", async () => {
		const issuer = await createAccessIssuer();
		const app = createApp({ accessKeys: () => issuer.keys });
		const res = await app.request(
			"/api/realtime",
			{ headers: sameOrigin },
			{ ...env, AUTH_DEV_BYPASS: undefined, ...accessEnv },
		);
		expect(res.status).toBe(401);
	});

	it("answers 426 to a plain request", async () => {
		expect((await api("/realtime")).status).toBe(426);
	});

	it("rejects an upgrade without an Origin header", async () => {
		const res = await api("/realtime", { headers: upgradeHeaders });
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "forbidden_origin" });
	});

	it("rejects an upgrade from another site", async () => {
		const res = await api("/realtime", { headers: { ...upgradeHeaders, Origin: "https://evil.example" } });
		expect(res.status).toBe(403);
		expect(await res.json()).toEqual({ error: "forbidden_origin" });
	});

	it("upgrades a same-origin request and relays broadcasts of the server-chosen scope", async () => {
		const socket = await open(api("/realtime?scope=org:other", { headers: sameOrigin }));
		const event = deviceEvent();

		await realtimeHub(env).broadcast(event);

		for (;;) {
			const frame = (await socket.next()) as RealtimeEvent;
			if (frame.type === "device.upserted" && frame.device.id === event.device.id) break;
		}
	});
});
