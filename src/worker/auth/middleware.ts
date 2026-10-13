import { createMiddleware } from "hono/factory";
import { touchActiveApiToken } from "../db/api-tokens";
import { createDb } from "../db/client";
import { type User, upsertUser } from "../db/users";
import { type AccessKeySource, DEV_USER_EMAIL, resolveAuthMode, verifyAccessJwt } from "./access";
import { hashApiToken } from "./api-tokens";

export type AppEnv = { Bindings: Env; Variables: { user: User } };

export const accessAuth = (keySource: AccessKeySource) =>
	createMiddleware<AppEnv>(async (c, next) => {
		const mode = resolveAuthMode(c.env, c.req.url);
		if (mode.kind === "misconfigured") return c.json({ error: "auth_not_configured" }, 500);

		let email = DEV_USER_EMAIL;
		if (mode.kind === "access") {
			const assertion = c.req.header("Cf-Access-Jwt-Assertion");
			const verified = assertion ? await verifyAccessJwt(assertion, mode, keySource) : null;
			if (!verified) return c.json({ error: "unauthorized" }, 401);
			email = verified;
		}
		c.set("user", await upsertUser(createDb(c.env.DB), email));
		await next();
	});

export const apiTokenAuth = createMiddleware<AppEnv>(async (c, next) => {
	const token = /^Bearer\s+(\S+)$/i.exec(c.req.header("authorization") ?? "")?.[1];
	if (!token || !(await touchActiveApiToken(createDb(c.env.DB), await hashApiToken(token)))) {
		return c.json({ error: "unauthorized" }, 401);
	}
	await next();
});
