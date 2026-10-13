import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { type InvalidBodyResponse, uplinkCallbackSchema } from "#shared/sigfox";
import type { AppEnv } from "../auth/middleware";
import { createDb } from "../db/client";
import { ingestUplink } from "../services/ingest-uplink";

export const callbackRoutes = new Hono<AppEnv>().post(
	"/sigfox/uplink",
	zValidator("json", uplinkCallbackSchema, (result, c) => {
		if (result.success) return;
		const issues = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
		return c.json({ error: "invalid_body", issues } satisfies InvalidBodyResponse, 400);
	}),
	async (c) => {
		await ingestUplink(createDb(c.env.DB), c.req.valid("json"));
		// Why 204: DATA/UPLINK callbacks ignore the body; BIDIR replies are a later feature.
		return c.body(null, 204);
	},
);
