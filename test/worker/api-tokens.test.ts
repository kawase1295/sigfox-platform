import { env, exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { API_TOKEN_PREFIX, apiTokenListSchema, createApiTokenResponseSchema } from "#shared/api-tokens";
import { DEV_USER_EMAIL } from "../../src/worker/auth/access";

// The test pool runs with AUTH_DEV_BYPASS=1 and no Access config, so the default export acts as the dev user.
const api = (path: string, init?: RequestInit) => exports.default.fetch(`http://localhost/api${path}`, init);

async function createToken(name: string) {
	const res = await api("/tokens", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ name }),
	});
	expect(res.status).toBe(201);
	return createApiTokenResponseSchema.parse(await res.json());
}

const ping = (authorization?: string) =>
	api("/callbacks/ping", { method: "POST", headers: authorization ? { authorization } : {} });

describe("API tokens", () => {
	it("returns the plaintext once and stores only its SHA-256 hash", async () => {
		const { token, secret } = await createToken("sigfox backend");

		expect(secret.startsWith(API_TOKEN_PREFIX)).toBe(true);
		expect(token).toMatchObject({ name: "sigfox backend", createdBy: DEV_USER_EMAIL, revokedAt: null });
		const row = await env.DB.prepare("select * from api_tokens where id = ?").bind(token.id).first();
		expect(JSON.stringify(row)).not.toContain(secret);
		const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)));
		expect(row?.token_hash).toBe(Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join(""));
	});

	it("lists tokens without any secret material", async () => {
		const { token } = await createToken("listed");
		const res = await api("/tokens");
		const { tokens } = apiTokenListSchema.parse(await res.json());
		expect(tokens.map((t) => t.id)).toContain(token.id);
	});

	it("rejects an empty name", async () => {
		const res = await api("/tokens", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ name: "  " }),
		});
		expect(res.status).toBe(400);
	});

	it("returns 404 when revoking an unknown token", async () => {
		expect((await api(`/tokens/${crypto.randomUUID()}`, { method: "DELETE" })).status).toBe(404);
	});
});

describe("bearer guard on /api/callbacks/*", () => {
	it("accepts a valid token and records its last use", async () => {
		const { token, secret } = await createToken("valid");

		expect((await ping(`Bearer ${secret}`)).status).toBe(204);

		const { tokens } = apiTokenListSchema.parse(await (await api("/tokens")).json());
		expect(tokens.find((t) => t.id === token.id)?.lastUsedAt).not.toBeNull();
	});

	it("rejects a revoked token", async () => {
		const { token, secret } = await createToken("revoked");
		expect((await api(`/tokens/${token.id}`, { method: "DELETE" })).status).toBe(204);

		expect((await ping(`Bearer ${secret}`)).status).toBe(401);
		const { tokens } = apiTokenListSchema.parse(await (await api("/tokens")).json());
		expect(tokens.find((t) => t.id === token.id)?.revokedAt).not.toBeNull();
	});

	it("rejects a missing, malformed or unknown token", async () => {
		expect((await ping()).status).toBe(401);
		expect((await ping("Basic abc")).status).toBe(401);
		expect((await ping(`Bearer ${API_TOKEN_PREFIX}unknown`)).status).toBe(401);
	});
});
