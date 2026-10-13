import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Device } from "#shared/devices";
import type { Location } from "#shared/locations";
import { Map as FakeMap, Popup as FakePopup } from "./helpers/fake-maplibre";
import { renderApp } from "./helpers/render-app";

vi.mock("maplibre-gl", () => import("./helpers/fake-maplibre"));

type Fake = InstanceType<typeof FakeMap> & typeof FakeMap;
const maps = () => (FakeMap as unknown as { instances: Fake[] }).instances;
const popups = () => (FakePopup as unknown as { opened: { node: HTMLElement | null }[] }).opened;

const device = (id: string, name: string | null = null): Device => ({
	id,
	name,
	createdAt: "2026-10-01T00:00:00.000Z",
	lastMessageAt: "2026-10-01T00:10:00.000Z",
	messageCount: 1,
	parserId: null,
});

const location = (id: number, over: Partial<Location> = {}): Location => ({
	id,
	deviceId: "1A2B3C",
	messageId: id,
	time: new Date(Date.UTC(2026, 9, 1, 0, id)).toISOString(),
	lat: 35 + id / 100,
	lng: 139 + id / 100,
	accuracy: null,
	source: "gps",
	...over,
});

let latest: Location[];
let track: Location[];

beforeEach(() => {
	maps().length = 0;
	popups().length = 0;
	latest = [location(1), location(2, { deviceId: "BEEF", source: "sigfox", accuracy: 1500 })];
	track = [location(1), location(2, { source: "sigfox", accuracy: 1500 })];
	vi.stubGlobal(
		"fetch",
		vi.fn(async (url: string) => {
			if (url === "/api/config") return Response.json({ mapStyleUrl: "https://tiles.example/style.json" });
			if (url === "/api/devices") return Response.json({ devices: [device("1A2B3C", "Truck"), device("BEEF")] });
			if (url === "/api/devices/1A2B3C") return Response.json(device("1A2B3C", "Truck"));
			if (url === "/api/devices/1A2B3C/messages") return Response.json({ messages: [], nextCursor: null });
			if (url === "/api/devices/1A2B3C/locations") return Response.json({ locations: track });
			if (url === "/api/locations/latest") return Response.json({ locations: latest });
			return new Response(null, { status: 404 });
		}),
	);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

async function loadedMap(): Promise<Fake> {
	await waitFor(() => expect(maps()).toHaveLength(1));
	const map = maps()[0] as Fake;
	await waitFor(() => expect(map.layers).toContain("points"));
	return map;
}

const features = (map: Fake, source: string) =>
	(map.sources.get(source)?.data as { features: { properties: Record<string, unknown> }[] } | undefined)?.features ??
	[];

describe("devices overview map", () => {
	it("shows the latest position of each device with the configured style", async () => {
		renderApp("/");
		const map = await loadedMap();

		expect(map.options.style).toBe("https://tiles.example/style.json");
		expect(map.sources.get("points")?.spec.cluster).toBe(true);
		await waitFor(() => expect(features(map, "points").map((f) => f.properties.id)).toEqual([1, 2]));
		expect(map.fitted).toHaveLength(1);
		expect(screen.getByRole("region", { name: "Map of the latest device positions" })).toBeTruthy();
	});

	it("opens a popup with the device name, time and source", async () => {
		renderApp("/");
		const map = await loadedMap();
		await waitFor(() => expect(features(map, "points")).toHaveLength(2));

		act(() => map.fire("click:points", { features: [{ properties: { id: 2 } }], lngLat: [139, 35] }));
		const text = popups()[0]?.node?.textContent ?? "";
		expect(text).toContain("BEEF");
		expect(text).toContain("Sigfox ±1,500 m");

		act(() => map.fire("click:points", { features: [{ properties: { id: 1 } }], lngLat: [139, 35] }));
		expect(popups()[1]?.node?.textContent).toContain("Truck");
	});

	it("shows no map while no device has a position", async () => {
		latest = [];
		renderApp("/");
		await screen.findByText("1A2B3C");
		expect(maps()).toHaveLength(0);
	});
});

describe("device track map", () => {
	it("draws the track, the latest point and the accuracy of Sigfox positions", async () => {
		renderApp("/devices/1A2B3C");
		const map = await loadedMap();

		expect(map.sources.get("points")?.spec.cluster).toBe(false);
		await waitFor(() => expect(features(map, "line")).toHaveLength(1));
		expect(features(map, "points").map((f) => f.properties.latest)).toEqual([false, true]);
		expect(features(map, "areas")).toHaveLength(1);
	});

	it("explains where positions come from when there are none", async () => {
		track = [];
		renderApp("/devices/1A2B3C", "ja");
		expect(await screen.findByText(/位置情報はまだありません/)).toBeTruthy();
		expect(maps()).toHaveLength(0);
	});
});
