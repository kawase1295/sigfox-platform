import { exports } from "cloudflare:workers";
import { expect } from "vitest";
import { createApiTokenResponseSchema } from "#shared/api-tokens";

// The test pool runs with AUTH_DEV_BYPASS=1 and no Access config, so the default export acts as the dev user.
export const api = (path: string, init?: RequestInit) => exports.default.fetch(`http://localhost/api${path}`, init);

export const json = (method: string, body: unknown, headers: Record<string, string> = {}): RequestInit => ({
	method,
	headers: { "content-type": "application/json", ...headers },
	body: JSON.stringify(body),
});

export async function createToken(name: string) {
	const res = await api("/tokens", json("POST", { name }));
	expect(res.status).toBe(201);
	return createApiTokenResponseSchema.parse(await res.json());
}

/** Random IDs keep tests independent even when they share one D1 database. */
export const randomHex = (digits: number) =>
	Array.from(crypto.getRandomValues(new Uint8Array(digits)), (b) => (b % 16).toString(16))
		.join("")
		.toUpperCase();
