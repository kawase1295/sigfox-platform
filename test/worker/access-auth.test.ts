import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { generateKeyPair } from "jose";
import { beforeAll, describe, expect, it } from "vitest";
import { meResponseSchema } from "#shared/auth";
import { createApp } from "../../src/worker/app";
import { DEV_USER_EMAIL } from "../../src/worker/auth/access";
import { createDb } from "../../src/worker/db/client";
import { users } from "../../src/worker/db/schema";
import { accessEnv, createAccessIssuer } from "./helpers/access";

let issuer: Awaited<ReturnType<typeof createAccessIssuer>>;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
	issuer = await createAccessIssuer();
	app = createApp({ accessKeys: () => issuer.keys });
});

const me = (headers: Record<string, string>, bindings: Record<string, unknown> = accessEnv, url = "/api/me") =>
	app.request(url, { headers }, { ...env, AUTH_DEV_BYPASS: undefined, ...bindings });

describe("Cloudflare Access on /api/*", () => {
	it("accepts a valid assertion and upserts the user by email", async () => {
		const token = await issuer.sign({ email: "alice@example.com" });

		const first = await me({ "Cf-Access-Jwt-Assertion": token });
		const second = await me({ "Cf-Access-Jwt-Assertion": token });

		expect(first.status).toBe(200);
		expect(meResponseSchema.parse(await first.json())).toEqual({ email: "alice@example.com" });
		expect(second.status).toBe(200);
		const rows = await createDb(env.DB).select().from(users).where(eq(users.email, "alice@example.com"));
		expect(rows).toHaveLength(1);
	});

	it("rejects a request without the assertion header", async () => {
		const res = await me({});
		expect(res.status).toBe(401);
		expect(await res.json()).toEqual({ error: "unauthorized" });
	});

	it("rejects an assertion signed by an unknown key", async () => {
		const { privateKey } = await generateKeyPair("RS256");
		const res = await me({ "Cf-Access-Jwt-Assertion": await issuer.sign({ email: "a@example.com" }, privateKey) });
		expect(res.status).toBe(401);
	});

	it("rejects an assertion for another Access application", async () => {
		const res = await me({ "Cf-Access-Jwt-Assertion": await issuer.sign({ email: "a@example.com", aud: "other" }) });
		expect(res.status).toBe(401);
	});

	it("rejects an assertion from another team", async () => {
		const token = await issuer.sign({ email: "a@example.com", iss: "https://evil.cloudflareaccess.com" });
		expect((await me({ "Cf-Access-Jwt-Assertion": token })).status).toBe(401);
	});

	it("rejects an expired assertion", async () => {
		const token = await issuer.sign({ email: "a@example.com", exp: Math.floor(Date.now() / 1000) - 3600 });
		expect((await me({ "Cf-Access-Jwt-Assertion": token })).status).toBe(401);
	});

	it("rejects an assertion without an email (e.g. a service token)", async () => {
		expect((await me({ "Cf-Access-Jwt-Assertion": await issuer.sign({}) })).status).toBe(401);
	});

	it("leaves /api/health public", async () => {
		expect((await me({}, accessEnv, "/api/health")).status).toBe(200);
	});

	it("leaves /api/callbacks/* to the API token guard instead of Access", async () => {
		const token = await issuer.sign({ email: "alice@example.com" });
		const res = await app.request(
			"/api/callbacks/ping",
			{ method: "POST", headers: { "Cf-Access-Jwt-Assertion": token } },
			{ ...env, ...accessEnv },
		);
		expect(res.status).toBe(401);
	});
});

describe("local dev bypass", () => {
	it("signs in as the fixed dev user on localhost when Access is not configured", async () => {
		const res = await me({}, { AUTH_DEV_BYPASS: "1" }, "http://localhost/api/me");
		expect(res.status).toBe(200);
		expect(await res.json()).toEqual({ email: DEV_USER_EMAIL });
	});

	it("is ignored when Access is configured, so a stray flag cannot open production", async () => {
		const res = await me({}, { ...accessEnv, AUTH_DEV_BYPASS: "1" });
		expect(res.status).toBe(401);
	});

	it("is refused on a non-loopback host", async () => {
		const res = await me({}, { AUTH_DEV_BYPASS: "1" }, "https://sigfox.example.com/api/me");
		expect(res.status).toBe(500);
		expect(await res.json()).toEqual({ error: "auth_not_configured" });
	});

	it("fails closed when neither Access nor the bypass is configured", async () => {
		expect((await me({}, {})).status).toBe(500);
	});

	it("fails closed when Access is only half configured", async () => {
		expect((await me({}, { ACCESS_AUD: "x", AUTH_DEV_BYPASS: "1" })).status).toBe(500);
	});
});
