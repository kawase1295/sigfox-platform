import type { z } from "zod";
import { apiTokenListSchema, type CreateApiTokenRequest, createApiTokenResponseSchema } from "#shared/api-tokens";
import { meResponseSchema } from "#shared/auth";

async function request<T extends z.ZodType>(schema: T, path: string, init?: RequestInit): Promise<z.infer<T>> {
	const res = await fetch(path, init);
	if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} failed: ${res.status}`);
	return schema.parse(await res.json());
}

export const fetchMe = () => request(meResponseSchema, "/api/me");

export const listApiTokens = () => request(apiTokenListSchema, "/api/tokens").then((r) => r.tokens);

export const createApiToken = (body: CreateApiTokenRequest) =>
	request(createApiTokenResponseSchema, "/api/tokens", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

export async function revokeApiToken(id: string): Promise<void> {
	const res = await fetch(`/api/tokens/${encodeURIComponent(id)}`, { method: "DELETE" });
	if (!res.ok) throw new Error(`DELETE /api/tokens/${id} failed: ${res.status}`);
}
