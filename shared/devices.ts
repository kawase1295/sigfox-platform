import { z } from "zod";
import { parsedEntrySchema, parseErrorSchema } from "./parsers";

export const deviceIdSchema = z
	.string()
	.regex(/^[0-9a-fA-F]{1,8}$/)
	.transform((s) => s.toUpperCase());

/** The newest Sigfox ERROR callback (keep-alive breach) for a device. */
export const deviceErrorSchema = z.strictObject({
	time: z.iso.datetime(),
	severity: z.string(),
	info: z.string(),
});

export const deviceSchema = z.strictObject({
	id: z.string(),
	name: z.string().nullable(),
	createdAt: z.iso.datetime(),
	lastMessageAt: z.iso.datetime().nullable(),
	messageCount: z.number().int().nonnegative(),
	parserId: z.string().nullable(),
	lastError: deviceErrorSchema.nullable(),
});

export const receptionSchema = z.strictObject({
	station: z.string(),
	rssi: z.number(),
	/** Only DATA/UPLINK reports it reliably; DATA_ADVANCED duplicates may omit it. */
	snr: z.number().optional(),
	/** Repetitions the station received, from DATA_ADVANCED duplicates. */
	nbRep: z.number().int().nonnegative().optional(),
	/** `uplink` once the station's DATA/UPLINK arrived; `advanced` while it is known only from DATA_ADVANCED. */
	source: z.enum(["uplink", "advanced"]),
});

/** Sigfox link quality indicator from DATA_ADVANCED. */
export const lqiSchema = z.enum(["LIMIT", "AVERAGE", "GOOD", "EXCELLENT", "NA"]);

export const messageSchema = z.strictObject({
	id: z.number().int(),
	deviceId: z.string(),
	time: z.iso.datetime(),
	seqNumber: z.number().int(),
	data: z.string(),
	receptions: z.array(receptionSchema),
	/** Null until a DATA_ADVANCED callback for the message arrives. */
	lqi: lqiSchema.nullable(),
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
export type DeviceError = z.infer<typeof deviceErrorSchema>;
export type Reception = z.infer<typeof receptionSchema>;
export type Lqi = z.infer<typeof lqiSchema>;
export type Message = z.infer<typeof messageSchema>;
export type DeviceList = z.infer<typeof deviceListSchema>;
export type MessagePage = z.infer<typeof messagePageSchema>;
export type UpdateDeviceRequest = z.input<typeof updateDeviceRequestSchema>;

/** Lost until a message newer than the last ERROR callback arrives; Sigfox sends no "restored" callback. */
export const communicationLost = (d: Pick<Device, "lastError" | "lastMessageAt">) =>
	d.lastError !== null && (d.lastMessageAt === null || Date.parse(d.lastMessageAt) <= Date.parse(d.lastError.time));
