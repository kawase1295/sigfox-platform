import { beforeAll, describe, expect, it } from "vitest";
import { deviceSchema, messagePageSchema } from "#shared/devices";
import { parseResultSchema, parserListSchema, parserSampleListSchema, parserSchema } from "#shared/parsers";
import { api, createToken, json, randomHex } from "./helpers/api";

let bearer: string;
beforeAll(async () => {
	bearer = `Bearer ${(await createToken("parser tests")).secret}`;
});

async function createParser(code: string, name = "Test parser") {
	const res = await api("/parsers", json("POST", { name, code }));
	expect(res.status).toBe(201);
	return parserSchema.parse(await res.json());
}

async function assign(device: string, parserId: string | null) {
	const res = await api(`/devices/${device}`, json("PATCH", { parserId }));
	expect(res.status).toBe(200);
	return deviceSchema.parse(await res.json());
}

async function ingest(device: string, seqNumber: number, data: string, time = 1_760_000_000 + seqNumber * 600) {
	const body = { device, time, seqNumber, data, station: "1A2B", rssi: -100, snr: 10 };
	const res = await api("/callbacks/sigfox/uplink", json("POST", body, { authorization: bearer }));
	expect(res.status).toBe(204);
}

async function messages(device: string) {
	const res = await api(`/devices/${device}/messages`);
	return messagePageSchema.parse(await res.json()).messages;
}

const firstByte = `return [{ key: "b0", value: parseInt(payload.slice(0, 2), 16), type: "number", unit: "%" }];`;

describe("parsers API", () => {
	it("creates, lists, updates and deletes a parser", async () => {
		const created = await createParser("return [];", "  CRUD  ");
		expect(created).toMatchObject({ name: "CRUD", code: "return [];", deviceCount: 0 });

		const { parsers } = parserListSchema.parse(await (await api("/parsers")).json());
		expect(parsers.map((p) => p.id)).toContain(created.id);

		const patched = await api(`/parsers/${created.id}`, json("PATCH", { code: firstByte }));
		expect(parserSchema.parse(await patched.json())).toMatchObject({ name: "CRUD", code: firstByte });
		expect(parserSchema.parse(await (await api(`/parsers/${created.id}`)).json()).code).toBe(firstByte);

		expect((await api(`/parsers/${created.id}`, { method: "DELETE" })).status).toBe(204);
		expect((await api(`/parsers/${created.id}`)).status).toBe(404);
	});

	it("rejects invalid bodies and unknown ids", async () => {
		expect((await api("/parsers", json("POST", { name: "", code: "" }))).status).toBe(400);
		expect((await api("/parsers/nope", json("PATCH", {}))).status).toBe(400);
		expect((await api("/parsers/nope", json("PATCH", { name: "x" }))).status).toBe(404);
		expect((await api("/parsers/nope", { method: "DELETE" })).status).toBe(404);
	});

	it("test-runs code against a payload without saving anything", async () => {
		const ok = await api("/parsers/test", json("POST", { code: firstByte, payload: "2A" }));
		expect(parseResultSchema.parse(await ok.json())).toEqual({
			ok: true,
			parsed: [{ key: "b0", value: 42, type: "number", unit: "%" }],
		});

		const failed = await api("/parsers/test", json("POST", { code: "while (true) {}", payload: "00" }));
		expect(parseResultSchema.parse(await failed.json())).toMatchObject({ ok: false, error: { kind: "timeout" } });

		expect((await api("/parsers/test", json("POST", { code: "", payload: "zz" }))).status).toBe(400);
	});

	it("lists the bundled legacy samples", async () => {
		const { samples } = parserSampleListSchema.parse(await (await api("/parsers/samples")).json());
		expect(samples.map((s) => s.id)).toContain("sensit-v3");
	});

	it("is protected by Access", async () => {
		expect((await api("/callbacks/sigfox/uplink", json("POST", {}))).status).toBe(401);
		expect((await api("/parsers", { headers: { authorization: bearer } })).status).toBe(200);
	});
});

describe("parsing on ingest", () => {
	it("stores parsed values when the device has a parser", async () => {
		const device = randomHex(6);
		await ingest(device, 1, "00");
		const parser = await createParser(firstByte);
		expect(await assign(device, parser.id)).toMatchObject({ parserId: parser.id });

		await ingest(device, 2, "64");
		const [latest, older] = await messages(device);
		expect(latest).toMatchObject({ parsed: [{ key: "b0", value: 100, unit: "%" }], parseError: null });
		// Messages that arrived before the assignment are left alone; there is no reparse yet.
		expect(older).toMatchObject({ parsed: null, parseError: null });
	});

	it("passes the previous message's parsed output as lastParsedPayload", async () => {
		const device = randomHex(6);
		const code = `
			var total = lastParsedPayload.length ? lastParsedPayload[0].value : 0;
			return [{ key: "total", value: total + parseInt(payload, 16), type: "number" }];`;
		await ingest(device, 1, "00");
		await assign(device, (await createParser(code)).id);

		await ingest(device, 2, "01");
		await ingest(device, 3, "02");
		const [third, second] = await messages(device);
		expect(second?.parsed).toEqual([{ key: "total", value: 1, type: "number" }]);
		expect(third?.parsed).toEqual([{ key: "total", value: 3, type: "number" }]);
	});

	it("still stores the message when the parser fails", async () => {
		const device = randomHex(6);
		await ingest(device, 1, "00");
		await assign(device, (await createParser("throw new Error('bad frame');")).id);

		await ingest(device, 2, "ff");
		const [message] = await messages(device);
		expect(message).toMatchObject({
			data: "ff",
			parsed: null,
			parseError: { kind: "runtime", message: expect.stringContaining("bad frame") },
		});
	});

	it("does not reparse a redelivered frame", async () => {
		const device = randomHex(6);
		await ingest(device, 1, "00");
		const parser = await createParser(firstByte);
		await assign(device, parser.id);
		await ingest(device, 2, "01");
		await api(`/parsers/${parser.id}`, json("PATCH", { code: "throw 1;" }));

		await ingest(device, 2, "01");
		const [message] = await messages(device);
		expect(message).toMatchObject({ parsed: [{ value: 1 }], parseError: null });
	});

	it("unassigns devices when their parser is deleted", async () => {
		const device = randomHex(6);
		await ingest(device, 1, "00");
		const parser = await createParser(firstByte);
		await assign(device, parser.id);
		expect(parserSchema.parse(await (await api(`/parsers/${parser.id}`)).json()).deviceCount).toBe(1);

		await api(`/parsers/${parser.id}`, { method: "DELETE" });
		expect(deviceSchema.parse(await (await api(`/devices/${device}`)).json()).parserId).toBeNull();
	});

	it("rejects assigning an unknown parser", async () => {
		const device = randomHex(6);
		await ingest(device, 1, "00");
		expect((await api(`/devices/${device}`, json("PATCH", { parserId: "nope" }))).status).toBe(400);
	});
});
