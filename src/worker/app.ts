import { Hono } from "hono";
import { except } from "hono/combine";
import type { MeResponse } from "#shared/auth";
import type { HealthResponse } from "#shared/health";
import { type AccessKeySource, remoteAccessKeys } from "./auth/access";
import { type AppEnv, accessAuth, apiTokenAuth } from "./auth/middleware";
import { apiTokenRoutes } from "./routes/api-tokens";
import { callbackRoutes } from "./routes/callbacks";
import { deviceRoutes } from "./routes/devices";
import { parserRoutes } from "./routes/parsers";
import { realtimeRoutes } from "./routes/realtime";

export type AppDeps = { accessKeys?: AccessKeySource };

export function createApp({ accessKeys = remoteAccessKeys }: AppDeps = {}) {
	const app = new Hono<AppEnv>().basePath("/api");

	// Sigfox callbacks cannot pass Cloudflare Access, so they authenticate with API tokens instead.
	app.use("*", except(["/api/health", "/api/callbacks/*"], accessAuth(accessKeys)));
	app.use("/callbacks/*", apiTokenAuth);

	app.get("/health", (c) => c.json({ status: "ok" } satisfies HealthResponse));
	app.get("/me", (c) => c.json({ email: c.var.user.email } satisfies MeResponse));
	app.route("/tokens", apiTokenRoutes);
	app.route("/devices", deviceRoutes);
	app.route("/parsers", parserRoutes);
	app.route("/callbacks", callbackRoutes);
	app.route("/realtime", realtimeRoutes);
	// Lets operators test a token without creating Sigfox data; also exercised by the guard tests.
	app.post("/callbacks/ping", (c) => c.body(null, 204));

	app.notFound((c) => c.json({ error: "not_found" }, 404));
	return app;
}
