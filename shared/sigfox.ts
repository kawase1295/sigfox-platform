import { z } from "zod";
import { lqiSchema } from "./devices";

// Sigfox fills body templates by text substitution, so users who quote a variable send a string.
const numeric = <T extends z.ZodNumber>(schema: T) =>
	z
		.union([
			z.number(),
			z
				.string()
				.trim()
				.regex(/^-?\d+(\.\d+)?$/, "Expected a number")
				.transform(Number),
		])
		.pipe(schema);

const hex = (pattern: RegExp, message: string) => z.string().trim().regex(pattern, message);

const stationId = () => hex(/^[0-9a-fA-F]{1,8}$/, "Expected a station ID (hex)").transform((s) => s.toUpperCase());

// Fields every DATA callback carries; together they identify the frame.
const frameFields = {
	device: hex(/^[0-9a-fA-F]{1,8}$/, "Expected a Sigfox device ID (1-8 hex digits)").transform((s) => s.toUpperCase()),
	time: numeric(z.number().int().nonnegative()),
	seqNumber: numeric(z.number().int().nonnegative()),
	// Why allow empty: devices may send a 0-byte frame as a keep-alive.
	data: hex(/^([0-9a-fA-F]{2}){0,12}$/, "Expected 0-12 bytes of hex").transform((s) => s.toLowerCase()),
};

export const uplinkCallbackSchema = z.object({
	...frameFields,
	station: stationId(),
	rssi: numeric(z.number()),
	snr: numeric(z.number()),
});

// {duplicates} and {computedLocation} are JSON objects meant to be inserted unquoted; a quoted one arrives as text.
const embeddedJson = <T extends z.ZodType>(schema: T) =>
	z.preprocess((value) => {
		if (typeof value !== "string") return value;
		try {
			return JSON.parse(value);
		} catch {
			return value;
		}
	}, schema);

export const duplicateSchema = z.object({
	bsId: stationId(),
	rssi: numeric(z.number()),
	snr: numeric(z.number()).optional(),
	nbRep: numeric(z.number().int().nonnegative()).optional(),
});

/**
 * Coordinates are not range-checked here: an unusable position must not reject the frame it came with.
 * `status` 1 (OK) and 2 (WiFi fallback) carry a position; 0 (none) and 20 (invalid payload) do not.
 */
export const computedLocationSchema = z.object({
	lat: numeric(z.number()),
	lng: numeric(z.number()),
	radius: numeric(z.number()).optional(),
	source: numeric(z.number().int()).optional(),
	status: numeric(z.number().int()),
});

export const advancedCallbackSchema = z.object({
	...frameFields,
	lqi: z.string().trim().toUpperCase().pipe(lqiSchema).nullish(),
	// Nullish: both need a contract option (NETWORK METADATA, ATLAS) and are absent without it.
	duplicates: embeddedJson(z.array(duplicateSchema).nullish()),
	computedLocation: embeddedJson(computedLocationSchema.nullish()),
});

export const errorCallbackSchema = z.object({
	device: frameFields.device,
	time: frameFields.time,
	info: z.string().trim().max(1000),
	// Why free text: Sigfox has already retired one value (WARN); an unknown one must not drop the event.
	severity: z.string().trim().min(1).max(32).toUpperCase(),
});

export type UplinkCallback = z.output<typeof uplinkCallbackSchema>;
export type AdvancedCallback = z.output<typeof advancedCallbackSchema>;
export type ErrorCallback = z.output<typeof errorCallbackSchema>;
export type ComputedLocation = z.output<typeof computedLocationSchema>;

export const invalidBodyResponseSchema = z.strictObject({
	error: z.literal("invalid_body"),
	issues: z.array(z.strictObject({ path: z.string(), message: z.string() })),
});

export type InvalidBodyResponse = z.infer<typeof invalidBodyResponseSchema>;

/** The exact text users paste into the Sigfox backend's custom callback body. */
export const UPLINK_BODY_TEMPLATE =
	'{"device":"{device}","time":{time},"seqNumber":{seqNumber},"data":"{data}","station":"{station}","rssi":{rssi},"snr":{snr}}';

export const UPLINK_CALLBACK_PATH = "/api/callbacks/sigfox/uplink";

export const ADVANCED_BODY_TEMPLATE =
	'{"device":"{device}","time":{time},"seqNumber":{seqNumber},"data":"{data}","lqi":"{lqi}","duplicates":{duplicates},"computedLocation":{computedLocation}}';

export const ADVANCED_CALLBACK_PATH = "/api/callbacks/sigfox/advanced";

export const ERROR_BODY_TEMPLATE = '{"device":"{device}","time":{time},"info":"{info}","severity":"{severity}"}';

export const ERROR_CALLBACK_PATH = "/api/callbacks/sigfox/error";
