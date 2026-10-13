import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { type ApiTokenList, type CreateApiTokenResponse, createApiTokenRequestSchema } from "#shared/api-tokens";
import { generateApiToken, hashApiToken } from "../auth/api-tokens";
import type { AppEnv } from "../auth/middleware";
import { insertApiToken, listApiTokens, revokeApiToken } from "../db/api-tokens";
import { createDb } from "../db/client";

export const apiTokenRoutes = new Hono<AppEnv>()
	.get("/", async (c) => c.json({ tokens: await listApiTokens(createDb(c.env.DB)) } satisfies ApiTokenList))
	.post(
		"/",
		zValidator("json", createApiTokenRequestSchema, (result, c) => {
			if (!result.success) return c.json({ error: "invalid_request" }, 400);
		}),
		async (c) => {
			const secret = generateApiToken();
			const token = await insertApiToken(createDb(c.env.DB), {
				name: c.req.valid("json").name,
				tokenHash: await hashApiToken(secret),
				createdBy: c.var.user,
			});
			return c.json({ token, secret } satisfies CreateApiTokenResponse, 201);
		},
	)
	.delete("/:id", async (c) =>
		(await revokeApiToken(createDb(c.env.DB), c.req.param("id")))
			? c.body(null, 204)
			: c.json({ error: "not_found" }, 404),
	);
