import { act, cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Device, Message } from "#shared/devices";
import type { ParseResult, Parser } from "#shared/parsers";
import { renderApp } from "./helpers/render-app";

const parser: Parser = {
	id: "p1",
	name: "Sens'it v3",
	code: "return [];",
	deviceCount: 1,
	createdAt: "2026-10-01T00:00:00.000Z",
	updatedAt: "2026-10-01T00:00:00.000Z",
};

const device: Device = {
	id: "1A2B3C",
	name: null,
	createdAt: "2026-10-01T00:00:00.000Z",
	lastMessageAt: "2026-10-01T00:10:00.000Z",
	messageCount: 2,
	parserId: null,
};

const message = (id: number, over: Partial<Message>): Message => ({
	id,
	deviceId: "1A2B3C",
	time: "2026-10-01T00:10:00.000Z",
	seqNumber: id,
	data: "b60b9e64",
	receptions: [{ station: "AAAA", rssi: -120, snr: 10, source: "uplink" }],
	createdAt: "2026-10-01T00:00:00.000Z",
	updatedAt: "2026-10-01T00:00:00.000Z",
	parsed: null,
	parseError: null,
	...over,
});

let testResult: ParseResult;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
	testResult = { ok: true, parsed: [{ key: "temperature", value: 21.5, type: "number", unit: "°C" }] };
	fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
		const method = init?.method ?? "GET";
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		if (url === "/api/parsers" && method === "GET") return Response.json({ parsers: [parser] });
		if (url === "/api/parsers" && method === "POST")
			return Response.json({ ...parser, id: "p2", ...body }, { status: 201 });
		if (url === "/api/parsers/samples")
			return Response.json({
				samples: [{ id: "simplepack", name: "Simplepack", code: "// sp", examplePayload: "1102" }],
			});
		if (url === "/api/parsers/p1" || url === "/api/parsers/p2") return Response.json(parser);
		if (url === "/api/parsers/test") return Response.json(testResult);
		if (url === "/api/devices/1A2B3C" && method === "PATCH") return Response.json({ ...device, ...body });
		if (url === "/api/devices/1A2B3C") return Response.json(device);
		if (url === "/api/devices/1A2B3C/messages")
			return Response.json({
				messages: [
					message(2, {
						parsed: [
							{ key: "temperature", value: 21.5, type: "number", unit: "°C" },
							{ key: "door", value: null, type: "string" },
						],
					}),
					message(1, { parseError: { kind: "timeout", message: "InternalError: interrupted" } }),
				],
				nextCursor: null,
			});
		return new Response(null, { status: 404 });
	});
	vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

const calls = (url: string, method: string) =>
	fetchMock.mock.calls.filter(([u, init]) => u === url && (init?.method ?? "GET") === method);

describe("parsers list", () => {
	it("creates a parser from a bundled sample and opens it", async () => {
		const router = renderApp("/parsers");
		expect(await screen.findByRole("link", { name: "Sens'it v3" })).toBeTruthy();
		await screen.findByRole("option", { name: "Simplepack" });

		await act(async () =>
			fireEvent.change(screen.getByLabelText("Create from sample"), { target: { value: "simplepack" } }),
		);

		await waitFor(() => expect(router.state.location.pathname).toBe("/parsers/p2"));
		const [, init] = calls("/api/parsers", "POST")[0] ?? [];
		expect(JSON.parse(String(init?.body))).toEqual({ name: "Simplepack", code: "// sp" });
	});
});

describe("parser editor", () => {
	it("test-runs the code and shows the decoded values", async () => {
		renderApp("/parsers/p1");
		const editor = await screen.findByRole("textbox", { name: "Code" });
		expect(editor.textContent).toBe("return [];");
		const payload = screen.getByLabelText("Payload (hex)");

		fireEvent.change(payload, { target: { value: "b60b9e64" } });
		await act(async () => fireEvent.click(screen.getByRole("button", { name: "Run test" })));

		const row = (await screen.findByText("temperature")).closest("tr") as HTMLElement;
		expect(within(row).getByText("21.5")).toBeTruthy();
		expect(within(row).getByText("°C")).toBeTruthy();
		const [, init] = calls("/api/parsers/test", "POST")[0] ?? [];
		expect(JSON.parse(String(init?.body))).toEqual({ code: "return [];", payload: "b60b9e64" });
	});

	it("explains a failed test run", async () => {
		testResult = { ok: false, error: { kind: "syntax", message: "SyntaxError: unexpected token" } };
		renderApp("/parsers/p1");
		fireEvent.change(await screen.findByLabelText("Payload (hex)"), { target: { value: "00" } });
		await act(async () => fireEvent.click(screen.getByRole("button", { name: "Run test" })));

		const alert = await screen.findByRole("alert");
		expect(within(alert).getByText("Syntax error")).toBeTruthy();
		expect(within(alert).getByText("SyntaxError: unexpected token")).toBeTruthy();
	});
});

describe("device detail with a parser", () => {
	it("shows parsed values and parse errors in the messages table", async () => {
		renderApp("/devices/1A2B3C");

		expect(await screen.findByText(/21\.5 °C/)).toBeTruthy();
		expect(screen.queryByText(/door=/)).toBeNull();
		expect(screen.getByText("Parse error").getAttribute("title")).toBe("InternalError: interrupted");
	});

	it("assigns a parser to the device", async () => {
		renderApp("/devices/1A2B3C");
		await screen.findByRole("option", { name: "Sens'it v3" });

		await act(async () => fireEvent.change(screen.getByLabelText("Parser"), { target: { value: "p1" } }));

		await waitFor(() => expect(calls("/api/devices/1A2B3C", "PATCH")).toHaveLength(1));
		const [, init] = calls("/api/devices/1A2B3C", "PATCH")[0] ?? [];
		expect(JSON.parse(String(init?.body))).toEqual({ parserId: "p1" });
	});
});
