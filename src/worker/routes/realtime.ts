import { Hono } from "hono";
import type { AppEnv } from "../auth/middleware";
import { realtimeHub } from "../realtime/publish";

// Why require Origin: Access rides on a cookie and browsers do not apply CORS to WebSockets,
// so without this check any site could open the socket with the user's credentials.
function isSameOrigin(origin: string | undefined, requestUrl: string): boolean {
	if (!origin) return false;
	try {
		return new URL(origin).host === new URL(requestUrl).host;
	} catch {
		return false;
	}
}

// Why the scope is not a parameter: clients must not pick whose events they receive.
export const realtimeRoutes = new Hono<AppEnv>().get("/", async (c) => {
	if (c.req.header("Upgrade")?.toLowerCase() !== "websocket") return c.json({ error: "upgrade_required" }, 426);
	if (!isSameOrigin(c.req.header("Origin"), c.req.url)) return c.json({ error: "forbidden_origin" }, 403);
	return realtimeHub(c.env).fetch(c.req.raw);
});
