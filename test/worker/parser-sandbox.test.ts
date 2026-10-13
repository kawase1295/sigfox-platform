import { describe, expect, it } from "vitest";
import { runParser } from "../../src/worker/parsers/sandbox";

const entry = (key: string, value: number, type = "number") => ({ key, value, type });

describe("runParser", () => {
	it("runs a legacy-style function body with payload and lastParsedPayload", async () => {
		const code = `
			var payload;
			var previous = lastParsedPayload.length ? lastParsedPayload[0].value : 0;
			return [{ key: "temp", value: parseInt(payload.slice(0, 2), 16) + previous, type: "number", unit: "°C" }];`;
		const result = await runParser({ code, payload: "0a", lastParsedPayload: [entry("temp", 5)] });
		expect(result).toEqual({ ok: true, parsed: [{ key: "temp", value: 15, type: "number", unit: "°C" }] });
	});

	it("turns undefined values into null like legacy JSON storage did", async () => {
		const result = await runParser({ code: `var x; return [{ key: "a", value: x, type: "string" }];`, payload: "" });
		expect(result).toEqual({ ok: true, parsed: [{ key: "a", value: null, type: "string" }] });
	});

	it("reports a syntax error", async () => {
		const result = await runParser({ code: "return [;", payload: "00" });
		expect(result).toMatchObject({ ok: false, error: { kind: "syntax" } });
	});

	it("reports a runtime error with its message", async () => {
		const result = await runParser({ code: "return undefinedFn();", payload: "00" });
		expect(result).toMatchObject({
			ok: false,
			error: { kind: "runtime", message: expect.stringContaining("undefinedFn") },
		});
	});

	it("stops an infinite loop", async () => {
		const result = await runParser({ code: "while (true) {}", payload: "00" });
		expect(result).toMatchObject({ ok: false, error: { kind: "timeout" } });
	});

	// Hitting the heap limit is slow in QuickJS (seconds on workerd), hence the generous timeout.
	it("stops a memory blowup", { timeout: 30_000 }, async () => {
		const code = "var a = []; while (true) a.push(new Uint8Array(1 << 20));";
		const result = await runParser({ code, payload: "00" });
		expect(result).toMatchObject({ ok: false, error: { kind: "memory" } });
	});

	it("rejects output that is not a list of entries", async () => {
		for (const code of ["return 42;", "return [{ value: 1 }];", "return [{ key: 'a', value: {}, type: 'x' }];", ""]) {
			const result = await runParser({ code, payload: "00" });
			expect(result, code).toMatchObject({ ok: false, error: { kind: "invalid_output" } });
		}
	});

	it("exposes no host APIs", async () => {
		const code = `return [
			{ key: "fetch", value: typeof fetch, type: "string" },
			{ key: "require", value: typeof require, type: "string" },
			{ key: "process", value: typeof process, type: "string" },
		];`;
		const result = await runParser({ code, payload: "00" });
		expect(result).toMatchObject({
			ok: true,
			parsed: [{ value: "undefined" }, { value: "undefined" }, { value: "undefined" }],
		});
	});

	it("isolates executions from each other", async () => {
		await runParser({ code: "globalThis.leak = 1; return [];", payload: "00" });
		const result = await runParser({
			code: `return [{ key: "leak", value: typeof leak, type: "string" }];`,
			payload: "00",
		});
		expect(result).toMatchObject({ ok: true, parsed: [{ value: "undefined" }] });
	});

	it("still works after a failed execution", async () => {
		await runParser({ code: "while (true) {}", payload: "00" });
		const result = await runParser({ code: "return [];", payload: "00" });
		expect(result).toEqual({ ok: true, parsed: [] });
	});
});
