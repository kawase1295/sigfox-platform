import { describe, expect, it } from "vitest";
import { PARSER_SAMPLES } from "../../src/worker/parsers/samples";
import { runParser } from "../../src/worker/parsers/sandbox";

// One decoded value per sample, worked out by hand from the frame layout documented in each parser.
const expected: Record<string, { key: string; value: unknown }> = {
	"connected-plant": { key: "humidity", value: 80 },
	hidnseek: { key: "mode", value: "MSG_NO_MOTION" },
	"sensit-v2": { key: "mode", value: "Temperature & Humidity" },
	"sensit-v3": { key: "mode", value: "Temperature & Humidity" },
	simplepack: { key: "event", value: "Short press" },
	"td1205p-tracker": { key: "message_type", value: "Normal" },
};

describe("bundled legacy parser samples", () => {
	it.each(PARSER_SAMPLES.map((s) => [s.id, s] as const))("%s decodes its example payload", async (id, sample) => {
		const result = await runParser({ code: sample.code, payload: sample.examplePayload });
		if (!result.ok) throw new Error(`${id}: ${result.error.kind} ${result.error.message}`);
		expect(result.parsed).toContainEqual(expect.objectContaining(expected[id]));
	});

	it("covers every legacy sample", () => {
		expect(PARSER_SAMPLES.map((s) => s.id).sort()).toEqual(Object.keys(expected).sort());
	});
});
