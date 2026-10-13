import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { type InvalidBodyResponse, uplinkCallbackSchema } from "#shared/sigfox";
import type { AppEnv } from "../auth/middleware";
import { createDb } from "../db/client";
import { publishIngest } from "../realtime/ingest-events";
import { ingestUplink } from "../services/ingest-uplink";
import { parseMessage } from "../services/parse-message";

export const callbackRoutes = new Hono<AppEnv>().post(
	"/sigfox/uplink",
	zValidator("json", uplinkCallbackSchema, (result, c) => {
		if (result.success) return;
		const issues = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
		return c.json({ error: "invalid_body", issues } satisfies InvalidBodyResponse, 400);
	}),
	async (c) => {
		const db = createDb(c.env.DB);
		const ingested = await ingestUplink(db, c.req.valid("json"));
		const message = await parseMessage(db, ingested.device, ingested.message);
		// A frame parsed only now (e.g. redelivered after a parser was assigned) is a change too.
		const result = { ...ingested, message, changed: ingested.changed || message !== ingested.message };
		// Why waitUntil: Sigfox only needs the 204; browsers can learn about the frame a moment later.
		c.executionCtx.waitUntil(publishIngest(c.env, db, result));
		// Why 204: DATA/UPLINK callbacks ignore the body; BIDIR replies are a later feature.
		return c.body(null, 204);
	},
);
