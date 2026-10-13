import { Hono } from "hono";
import type { AppEnv } from "../auth/middleware";
import { realtimeHub } from "../realtime/publish";

// Why the scope is not a parameter: clients must not pick whose events they receive.
export const realtimeRoutes = new Hono<AppEnv>().get("/", async (c) => {
	if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") return c.json({ error: "upgrade_required" }, 426);
	return realtimeHub(c.env).fetch(c.req.raw);
});
