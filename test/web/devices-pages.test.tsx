import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Device, Message } from "#shared/devices";
import { ADVANCED_BODY_TEMPLATE, UPLINK_BODY_TEMPLATE } from "#shared/sigfox";
import { renderApp } from "./helpers/render-app";

const device = (over: Partial<Device> = {}): Device => ({
	id: "1A2B3C",
	name: null,
	createdAt: "2026-10-01T00:00:00.000Z",
	lastMessageAt: "2026-10-01T00:10:00.000Z",
	messageCount: 3,
	parserId: null,
	...over,
});

const message = (seqNumber: number): Message => ({
	id: seqNumber,
	deviceId: "1A2B3C",
	time: new Date(Date.UTC(2026, 9, 1, 0, seqNumber)).toISOString(),
	seqNumber,
	data: `0${seqNumber}ff`,
	receptions: [
		{ station: "AAAA", rssi: -120, snr: 10, source: "uplink" },
		{ station: "BBBB", rssi: -101.5, snr: 12, source: "uplink" },
	],
	createdAt: "2026-10-01T00:00:00.000Z",
	updatedAt: "2026-10-01T00:00:00.000Z",
	parsed: null,
	parseError: null,
	lqi: null,
});

let devices: Device[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	devices = [device()];
	fetchMock = vi.fn(async (url: string) => {
		if (url === "/api/devices") return Response.json({ devices });
		if (url === "/api/devices/1A2B3C") return Response.json(devices[0]);
		if (url === "/api/devices/1A2B3C/messages")
			return Response.json({ messages: [message(3), message(2)], nextCursor: "c1" });
		if (url === "/api/devices/1A2B3C/messages?cursor=c1")
			return Response.json({ messages: [message(1)], nextCursor: null });
		return new Response(null, { status: 404 });
	});
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

describe("devices list", () => {
	it("links each device to its detail page", async () => {
		const router = renderApp("/");
		const link = await screen.findByRole("link", { name: "1A2B3C" });

		await act(async () => fireEvent.click(link));

		await waitFor(() => expect(router.state.location.pathname).toBe("/devices/1A2B3C"));
	});

	it("guides to callback setup when there are no devices", async () => {
		devices = [];
		renderApp("/");
		expect(await screen.findByText(/No devices yet/)).toBeTruthy();
		expect(screen.getByRole("link", { name: "Set up callback" }).getAttribute("href")).toBe("/settings/callback");
	});
});

describe("device detail", () => {
	it("shows messages newest first and loads older pages on demand", async () => {
		renderApp("/devices/1A2B3C");

		const first = await screen.findByText("03ff");
		const row = first.closest("tr") as HTMLElement;
		expect(within(row).getByText("2")).toBeTruthy();
		expect(within(row).getByText("-101.5")).toBeTruthy();
		expect(screen.queryByText("01ff")).toBeNull();

		await act(async () => fireEvent.click(screen.getByRole("button", { name: "Load more messages" })));

		expect(await screen.findByText("01ff")).toBeTruthy();
		const data = screen.getAllByText(/^0\dff$/).map((el) => el.textContent);
		expect(data).toEqual(["03ff", "02ff", "01ff"]);
		expect(screen.queryByRole("button", { name: "Load more messages" })).toBeNull();
	});
});

describe("callback setup", () => {
	it("shows the endpoint and the exact body template", async () => {
		renderApp("/settings/callback");

		expect(await screen.findByText(`${location.origin}/api/callbacks/sigfox/uplink`)).toBeTruthy();
		expect(screen.getByText(UPLINK_BODY_TEMPLATE)).toBeTruthy();
		expect(UPLINK_BODY_TEMPLATE).toBe(
			'{"device":"{device}","time":{time},"seqNumber":{seqNumber},"data":"{data}","station":"{station}","rssi":{rssi},"snr":{snr}}',
		);
		expect(screen.getByText(`${location.origin}/api/callbacks/sigfox/advanced`)).toBeTruthy();
		expect(screen.getByText(ADVANCED_BODY_TEMPLATE)).toBeTruthy();
		expect(ADVANCED_BODY_TEMPLATE).toBe(
			'{"device":"{device}","time":{time},"seqNumber":{seqNumber},"data":"{data}","lqi":"{lqi}","duplicates":{duplicates},"computedLocation":{computedLocation}}',
		);
		const main = screen.getByRole("main");
		expect(within(main).getByRole("link", { name: "API tokens" }).getAttribute("href")).toBe("/settings/tokens");
	});
});
