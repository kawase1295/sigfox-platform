import { Hono } from "hono";
import { type ConfigResponse, configResponseSchema, DEFAULT_MAP_STYLE_URL } from "#shared/config";
import type { AppEnv } from "../auth/middleware";

/** A typo in MAP_STYLE_URL falls back to the default map rather than breaking every page that shows one. */
export function resolveConfig(env: { MAP_STYLE_URL?: string }): ConfigResponse {
	const parsed = configResponseSchema.safeParse({ mapStyleUrl: env.MAP_STYLE_URL || DEFAULT_MAP_STYLE_URL });
	if (parsed.success) return parsed.data;
	console.error(`MAP_STYLE_URL is not a URL: ${JSON.stringify(env.MAP_STYLE_URL)}; using the default style`);
	return { mapStyleUrl: DEFAULT_MAP_STYLE_URL };
}

export const configRoutes = new Hono<AppEnv>().get("/", (c) => c.json(resolveConfig(c.env)));
