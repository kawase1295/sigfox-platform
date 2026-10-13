import { z } from "zod";
import { parsedEntrySchema, parseErrorSchema } from "./parsers";

export const deviceIdSchema = z
	.string()
	.regex(/^[0-9a-fA-F]{1,8}$/)
	.transform((s) => s.toUpperCase());

export const deviceSchema = z.strictObject({
	id: z.string(),
	name: z.string().nullable(),
	createdAt: z.iso.datetime(),
	lastMessageAt: z.iso.datetime().nullable(),
	messageCount: z.number().int().nonnegative(),
	parserId: z.string().nullable(),
});

export const receptionSchema = z.strictObject({
	station: z.string(),
	rssi: z.number(),
	snr: z.number(),
	// Why a source: DATA_ADVANCED (#9) reports the same receptions with different detail.
	source: z.enum(["uplink"]),
});

export const messageSchema = z.strictObject({
	id: z.number().int(),
	deviceId: z.string(),
	time: z.iso.datetime(),
	seqNumber: z.number().int(),
	data: z.string(),
	receptions: z.array(receptionSchema),
	createdAt: z.iso.datetime(),
	updatedAt: z.iso.datetime(),
	/** Null until the device's parser ran on this message, or when it failed (see parseError). */
	parsed: z.array(parsedEntrySchema).nullable(),
	parseError: parseErrorSchema.nullable(),
});

export const deviceListSchema = z.strictObject({ devices: z.array(deviceSchema) });

export const MESSAGE_PAGE_DEFAULT = 50;
export const MESSAGE_PAGE_MAX = 200;

export const messagePageQuerySchema = z.object({
	cursor: z.string().optional(),
	limit: z.coerce.number().int().min(1).max(MESSAGE_PAGE_MAX).default(MESSAGE_PAGE_DEFAULT),
});

export const messagePageSchema = z.strictObject({
	messages: z.array(messageSchema),
	nextCursor: z.string().nullable(),
});

// Empty names clear the label rather than storing "".
export const updateDeviceRequestSchema = z
	.strictObject({
		name: z
			.string()
			.trim()
			.max(100)
			.nullable()
			.transform((s) => s || null)
			.optional(),
		parserId: z.string().min(1).nullable().optional(),
	})
	.refine((r) => r.name !== undefined || r.parserId !== undefined, "Nothing to update");

export type Device = z.infer<typeof deviceSchema>;
export type Reception = z.infer<typeof receptionSchema>;
export type Message = z.infer<typeof messageSchema>;
export type DeviceList = z.infer<typeof deviceListSchema>;
export type MessagePage = z.infer<typeof messagePageSchema>;
export type UpdateDeviceRequest = z.input<typeof updateDeviceRequestSchema>;
