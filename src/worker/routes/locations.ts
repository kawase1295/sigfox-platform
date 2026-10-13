import { Hono } from "hono";
import type { LocationList } from "#shared/locations";
import type { AppEnv } from "../auth/middleware";
import { createDb } from "../db/client";
import { latestLocations } from "../db/locations";

export const locationRoutes = new Hono<AppEnv>().get("/latest", async (c) =>
	c.json({ locations: await latestLocations(createDb(c.env.DB)) } satisfies LocationList),
);
