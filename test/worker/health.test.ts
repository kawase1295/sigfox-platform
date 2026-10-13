import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { healthResponseSchema } from "#shared/health";

describe("GET /api/health", () => {
	it("responds 200 with a body that satisfies the shared contract", async () => {
		const res = await exports.default.fetch("http://localhost/api/health");

		expect(res.status).toBe(200);
		expect(healthResponseSchema.parse(await res.json())).toEqual({ status: "ok" });
	});

	it("responds 404 as JSON for unknown API routes", async () => {
		const res = await exports.default.fetch("http://localhost/api/does-not-exist");

		expect(res.status).toBe(404);
		expect(await res.json()).toEqual({ error: "not_found" });
	});
});
