import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import type { z } from "zod";
import { advancedCallbackSchema, type InvalidBodyResponse, uplinkCallbackSchema } from "#shared/sigfox";
import type { AppEnv } from "../auth/middleware";
import { createDb, type Db } from "../db/client";
import type { LocationRow } from "../db/locations";
import { publishIngest } from "../realtime/ingest-events";
import type { IngestResult } from "../services/ingest";
import { ingestAdvanced } from "../services/ingest-advanced";
import { ingestUplink } from "../services/ingest-uplink";
import { gpsPosition, type Position, recordLocation, sigfoxPosition } from "../services/locations";
import { parseMessage } from "../services/parse-message";

const validBody = <T extends z.ZodType>(schema: T) =>
	zValidator("json", schema, (result, c) => {
		if (result.success) return;
		const issues = result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
		return c.json({ error: "invalid_body", issues } satisfies InvalidBodyResponse, 400);
	});

/** Shared by every DATA callback: parse the frame, store the positions it yields, notify browsers. */
async function afterIngest(c: Context<AppEnv>, db: Db, ingested: IngestResult, sigfox: Position | null = null) {
	const message = await parseMessage(db, ingested.device, ingested.message);
	// A frame parsed only now (e.g. redelivered after a parser was assigned) is a change too.
	const result = { ...ingested, message, changed: ingested.changed || message !== ingested.message };

	const created: (LocationRow | null)[] = [];
	if (sigfox) created.push(await recordLocation(db, message, "sigfox", sigfox));
	const gps = gpsPosition(message.parsed);
	if (gps) created.push(await recordLocation(db, message, "gps", gps));

	// Why waitUntil: Sigfox only needs the 204; browsers can learn about the frame a moment later.
	c.executionCtx.waitUntil(
		publishIngest(
			c.env,
			db,
			result,
			created.filter((l) => l !== null),
		),
	);
	// Why 204: DATA callbacks ignore the body; BIDIR replies are a later feature.
	return c.body(null, 204);
}

export const callbackRoutes = new Hono<AppEnv>()
	.post("/sigfox/uplink", validBody(uplinkCallbackSchema), async (c) => {
		const db = createDb(c.env.DB);
		return afterIngest(c, db, await ingestUplink(db, c.req.valid("json")));
	})
	.post("/sigfox/advanced", validBody(advancedCallbackSchema), async (c) => {
		const db = createDb(c.env.DB);
		const body = c.req.valid("json");
		return afterIngest(c, db, await ingestAdvanced(db, body), sigfoxPosition(body.computedLocation));
	});
