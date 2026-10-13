import { type InfiniteData, QueryClient } from "@tanstack/react-query";
import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Device, DeviceList, Message, MessagePage } from "#shared/devices";
import type { Location } from "#shared/locations";
import type { RealtimeEvent } from "#shared/realtime";
import { applyRealtimeEvent } from "../../src/web/realtime/apply";
import { connectRealtime } from "../../src/web/realtime/connection";
import { FakeWebSocket } from "./helpers/fake-websocket";
import { renderApp } from "./helpers/render-app";

const device = (over: Partial<Device> = {}): Device => ({
	id: "1A2B3C",
	name: null,
	createdAt: "2026-10-01T00:00:00.000Z",
	lastMessageAt: "2026-10-01T00:10:00.000Z",
	messageCount: 1,
	parserId: null,
	lastError: null,
	...over,
});

const message = (id: number, over: Partial<Message> = {}): Message => ({
	id,
	deviceId: "1A2B3C",
	time: new Date(Date.UTC(2026, 9, 1, 0, id)).toISOString(),
	seqNumber: id,
	data: `0${id}`,
	receptions: [{ station: "AAAA", rssi: -120, snr: 10, source: "uplink" }],
	createdAt: "2026-10-01T00:00:00.000Z",
	updatedAt: "2026-10-01T00:00:00.000Z",
	parsed: null,
	parseError: null,
	lqi: null,
	...over,
});

const messagesKey = ["devices", "1A2B3C", "messages"];
const pages = (...ps: MessagePage[]): InfiniteData<MessagePage, string | null> => ({
	pages: ps,
	pageParams: ps.map((_, i) => (i === 0 ? null : `c${i}`)),
});

describe("applyRealtimeEvent", () => {
	let client: QueryClient;
	beforeEach(() => {
		client = new QueryClient();
	});

	it("adds a new device to the cached list in display order", () => {
		client.setQueryData<Device[]>(["devices"], [device({ id: "OLD", lastMessageAt: "2026-09-01T00:00:00.000Z" })]);

		applyRealtimeEvent(client, { type: "device.upserted", device: device() });

		expect(client.getQueryData<Device[]>(["devices"])?.map((d) => d.id)).toEqual(["1A2B3C", "OLD"]);
	});

	it("replaces a known device in the list and its detail", () => {
		client.setQueryData<Device[]>(["devices"], [device()]);
		client.setQueryData<Device>(["devices", "1A2B3C"], device());

		applyRealtimeEvent(client, { type: "device.upserted", device: device({ messageCount: 2 }) });

		expect(client.getQueryData<Device[]>(["devices"])).toEqual([device({ messageCount: 2 })]);
		expect(client.getQueryData<Device>(["devices", "1A2B3C"])?.messageCount).toBe(2);
	});

	it("does not create caches nobody asked for", () => {
		applyRealtimeEvent(client, { type: "device.upserted", device: device() });
		applyRealtimeEvent(client, { type: "message.upserted", deviceId: "1A2B3C", message: message(1) });

		expect(client.getQueryCache().getAll()).toHaveLength(0);
	});

	it("puts a new message at the top of the first page", () => {
		client.setQueryData(
			messagesKey,
			pages({ messages: [message(2)], nextCursor: "c1" }, { messages: [message(1)], nextCursor: null }),
		);

		applyRealtimeEvent(client, { type: "message.upserted", deviceId: "1A2B3C", message: message(3) });

		const data = client.getQueryData<InfiniteData<MessagePage>>(messagesKey);
		expect(data?.pages.map((p) => p.messages.map((m) => m.id))).toEqual([[3, 2], [1]]);
	});

	it("updates a message in place on whichever page holds it", () => {
		client.setQueryData(
			messagesKey,
			pages({ messages: [message(2)], nextCursor: "c1" }, { messages: [message(1)], nextCursor: null }),
		);
		const updated = message(1, {
			receptions: [...message(1).receptions, { station: "BBBB", rssi: -99, snr: 1, source: "uplink" }],
		});

		applyRealtimeEvent(client, { type: "message.upserted", deviceId: "1A2B3C", message: updated });

		const data = client.getQueryData<InfiniteData<MessagePage>>(messagesKey);
		expect(data?.pages[1]?.messages).toEqual([updated]);
		expect(data?.pages[0]?.messages.map((m) => m.id)).toEqual([2]);
	});

	it("leaves an older unseen message to pagination", () => {
		client.setQueryData(messagesKey, pages({ messages: [message(5), message(4)], nextCursor: "c1" }));

		applyRealtimeEvent(client, { type: "message.upserted", deviceId: "1A2B3C", message: message(1) });

		const data = client.getQueryData<InfiniteData<MessagePage>>(messagesKey);
		expect(data?.pages[0]?.messages.map((m) => m.id)).toEqual([5, 4]);
	});

	it("slots a late frame into the first page when it is the only page", () => {
		client.setQueryData(messagesKey, pages({ messages: [message(5), message(3)], nextCursor: null }));

		applyRealtimeEvent(client, { type: "message.upserted", deviceId: "1A2B3C", message: message(4) });

		const data = client.getQueryData<InfiniteData<MessagePage>>(messagesKey);
		expect(data?.pages[0]?.messages.map((m) => m.id)).toEqual([5, 4, 3]);
	});
});

describe("applyRealtimeEvent for locations", () => {
	let client: QueryClient;
	beforeEach(() => {
		client = new QueryClient();
	});

	const location = (id: number, over: Partial<Location> = {}): Location => ({
		id,
		deviceId: "1A2B3C",
		messageId: id,
		time: new Date(Date.UTC(2026, 9, 1, 0, id)).toISOString(),
		lat: 35,
		lng: 139,
		accuracy: null,
		source: "gps",
		...over,
	});
	const created = (l: Location): RealtimeEvent => ({ type: "location.created", location: l });
	const latestKey = ["locations", "latest"];
	const trackKey = ["devices", "1A2B3C", "locations"];

	it("moves a device's latest position forward, never back", () => {
		client.setQueryData<Location[]>(latestKey, [location(2), location(9, { deviceId: "OTHER" })]);

		applyRealtimeEvent(client, created(location(3)));
		applyRealtimeEvent(client, created(location(1)));
		applyRealtimeEvent(client, created(location(4, { deviceId: "NEW" })));

		const latest = client.getQueryData<Location[]>(latestKey) ?? [];
		expect(latest.map((l) => [l.deviceId, l.id]).sort()).toEqual([
			["1A2B3C", 3],
			["NEW", 4],
			["OTHER", 9],
		]);
	});

	it("prefers a GPS fix over the Sigfox estimate of the same frame", () => {
		client.setQueryData<Location[]>(latestKey, [location(1)]);
		const sigfox = location(2, { time: location(1).time, source: "sigfox", accuracy: 1000 });

		applyRealtimeEvent(client, created(sigfox));

		expect(client.getQueryData<Location[]>(latestKey)?.map((l) => l.id)).toEqual([1]);
	});

	it("inserts into a cached track in time order, once", () => {
		client.setQueryData<Location[]>(trackKey, [location(1), location(3)]);

		applyRealtimeEvent(client, created(location(4)));
		applyRealtimeEvent(client, created(location(2)));
		applyRealtimeEvent(client, created(location(2)));

		expect(client.getQueryData<Location[]>(trackKey)?.map((l) => l.id)).toEqual([1, 2, 3, 4]);
	});

	it("does not create location caches nobody asked for", () => {
		applyRealtimeEvent(client, created(location(1)));
		expect(client.getQueryCache().getAll()).toHaveLength(0);
	});
});

describe("connectRealtime", () => {
	const events: RealtimeEvent[] = [];
	const statuses: string[] = [];
	const onReconnect = vi.fn();
	let stop: () => void;

	beforeEach(() => {
		vi.useFakeTimers();
		FakeWebSocket.instances = [];
		events.length = 0;
		statuses.length = 0;
		onReconnect.mockReset();
		stop = connectRealtime({
			url: "ws://example.test/api/realtime",
			createSocket: (url) => new FakeWebSocket(url) as unknown as WebSocket,
			onEvent: (e) => events.push(e),
			onStatus: (s) => statuses.push(s),
			onReconnect,
		});
	});

	afterEach(() => {
		stop();
		vi.useRealTimers();
	});

	it("delivers valid events and drops malformed frames", () => {
		FakeWebSocket.latest.open();
		FakeWebSocket.latest.receive("not json");
		FakeWebSocket.latest.receive({ type: "device.deleted" });
		FakeWebSocket.latest.receive({ type: "device.upserted", device: device() });

		expect(events).toEqual([{ type: "device.upserted", device: device() }]);
		expect(statuses).toEqual(["connecting", "open"]);
	});

	it("reconnects with exponential backoff and signals the reconnect", () => {
		FakeWebSocket.latest.open();
		FakeWebSocket.latest.drop();
		expect(statuses.at(-1)).toBe("reconnecting");

		vi.advanceTimersByTime(999);
		expect(FakeWebSocket.instances).toHaveLength(1);
		vi.advanceTimersByTime(1);
		expect(FakeWebSocket.instances).toHaveLength(2);

		FakeWebSocket.latest.drop();
		vi.advanceTimersByTime(1999);
		expect(FakeWebSocket.instances).toHaveLength(2);
		vi.advanceTimersByTime(1);
		expect(FakeWebSocket.instances).toHaveLength(3);
		expect(onReconnect).not.toHaveBeenCalled();

		FakeWebSocket.latest.open();
		expect(onReconnect).toHaveBeenCalledOnce();
		expect(statuses.at(-1)).toBe("open");
	});

	it("does not reconnect after it is stopped", () => {
		FakeWebSocket.latest.open();
		stop();
		FakeWebSocket.latest.drop();
		vi.advanceTimersByTime(60_000);

		expect(FakeWebSocket.instances).toHaveLength(1);
	});
});

describe("realtime in the app shell", () => {
	let fetchMock: ReturnType<typeof vi.fn>;
	beforeEach(() => {
		fetchMock = vi.fn(async (url: string) => {
			if (url === "/api/devices") return Response.json({ devices: [device()] } satisfies DeviceList);
			if (url === "/api/devices/1A2B3C") return Response.json(device());
			if (url === "/api/devices/1A2B3C/messages")
				return Response.json({ messages: [message(1)], nextCursor: null } satisfies MessagePage);
			return new Response(null, { status: 404 });
		});
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
	});

	it("connects to /api/realtime and shows the connection state in words", async () => {
		renderApp("/");
		expect((await screen.findByRole("status")).textContent).toContain("Connecting");
		expect(FakeWebSocket.latest.url).toBe(`ws://${location.host}/api/realtime`);

		act(() => FakeWebSocket.latest.open());

		expect(screen.getByRole("status").textContent).toContain("Live");
	});

	it("shows a pushed message on the device page without refetching", async () => {
		renderApp("/devices/1A2B3C");
		await screen.findByText("01");
		act(() => FakeWebSocket.latest.open());
		const calls = fetchMock.mock.calls.length;

		act(() => FakeWebSocket.latest.receive({ type: "message.upserted", deviceId: "1A2B3C", message: message(2) }));

		expect(await screen.findByText("02")).toBeTruthy();
		expect(fetchMock.mock.calls.length).toBe(calls);
	});

	it("refetches device data after a reconnect", async () => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
		renderApp("/");
		await screen.findByRole("link", { name: "1A2B3C" });
		act(() => FakeWebSocket.latest.open());
		act(() => FakeWebSocket.latest.drop());
		const calls = fetchMock.mock.calls.length;

		await act(async () => vi.advanceTimersByTime(1000));
		act(() => FakeWebSocket.latest.open());

		await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(calls));
		vi.useRealTimers();
	});
});
