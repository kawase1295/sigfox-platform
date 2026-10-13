import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import {
	type DeviceList,
	deviceIdSchema,
	type MessagePage,
	messagePageQuerySchema,
	updateDeviceRequestSchema,
} from "#shared/devices";
import type { AppEnv } from "../auth/middleware";
import { createDb } from "../db/client";
import { decodeCursor, getDevice, listDevices, listMessages, renameDevice } from "../db/devices";

type DeviceEnv = AppEnv & { Variables: { deviceId: string } };

const notFound = { error: "not_found" } as const;
const invalidRequest = { error: "invalid_request" } as const;

// Normalizes the path ID once so every handler sees the stored (uppercase) form.
const deviceParam = createMiddleware<DeviceEnv>(async (c, next) => {
	const parsed = deviceIdSchema.safeParse(c.req.param("id"));
	if (!parsed.success) return c.json(notFound, 404);
	c.set("deviceId", parsed.data);
	await next();
});

export const deviceRoutes = new Hono<DeviceEnv>()
	.get("/", async (c) => c.json({ devices: await listDevices(createDb(c.env.DB)) } satisfies DeviceList))
	.use("/:id", deviceParam)
	.use("/:id/*", deviceParam)
	.get("/:id", async (c) => {
		const device = await getDevice(createDb(c.env.DB), c.var.deviceId);
		return device ? c.json(device) : c.json(notFound, 404);
	})
	.patch(
		"/:id",
		zValidator("json", updateDeviceRequestSchema, (result, c) => {
			if (!result.success) return c.json(invalidRequest, 400);
		}),
		async (c) => {
			const device = await renameDevice(createDb(c.env.DB), c.var.deviceId, c.req.valid("json").name);
			return device ? c.json(device) : c.json(notFound, 404);
		},
	)
	.get(
		"/:id/messages",
		zValidator("query", messagePageQuerySchema, (result, c) => {
			if (!result.success) return c.json(invalidRequest, 400);
		}),
		async (c) => {
			const db = createDb(c.env.DB);
			const { cursor: rawCursor, limit } = c.req.valid("query");
			const cursor = rawCursor === undefined ? null : decodeCursor(rawCursor);
			if (rawCursor !== undefined && !cursor) return c.json(invalidRequest, 400);
			if (!(await getDevice(db, c.var.deviceId))) return c.json(notFound, 404);
			return c.json((await listMessages(db, c.var.deviceId, { cursor, limit })) satisfies MessagePage);
		},
	);
