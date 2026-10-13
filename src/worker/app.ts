import { Hono } from "hono";
import { except } from "hono/combine";
import type { MeResponse } from "#shared/auth";
import type { HealthResponse } from "#shared/health";
import { type AccessKeySource, remoteAccessKeys } from "./auth/access";
import { type AppEnv, accessAuth, apiTokenAuth } from "./auth/middleware";
import { apiTokenRoutes } from "./routes/api-tokens";

export type AppDeps = { accessKeys?: AccessKeySource };

export function createApp({ accessKeys = remoteAccessKeys }: AppDeps = {}) {
	const app = new Hono<AppEnv>().basePath("/api");

	// Sigfox callbacks cannot pass Cloudflare Access, so they authenticate with API tokens instead.
	app.use("*", except(["/api/health", "/api/callbacks/*"], accessAuth(accessKeys)));
	app.use("/callbacks/*", apiTokenAuth);

	app.get("/health", (c) => c.json({ status: "ok" } satisfies HealthResponse));
	app.get("/me", (c) => c.json({ email: c.var.user.email } satisfies MeResponse));
	app.route("/tokens", apiTokenRoutes);
	// Placeholder so the token guard is exercised until real Sigfox callbacks land.
	app.post("/callbacks/ping", (c) => c.body(null, 204));

	app.notFound((c) => c.json({ error: "not_found" }, 404));
	return app;
}
