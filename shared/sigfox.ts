import { z } from "zod";

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

export const uplinkCallbackSchema = z.object({
	device: hex(/^[0-9a-fA-F]{1,8}$/, "Expected a Sigfox device ID (1-8 hex digits)").transform((s) => s.toUpperCase()),
	time: numeric(z.number().int().nonnegative()),
	seqNumber: numeric(z.number().int().nonnegative()),
	// Why allow empty: devices may send a 0-byte frame as a keep-alive.
	data: hex(/^([0-9a-fA-F]{2}){0,12}$/, "Expected 0-12 bytes of hex").transform((s) => s.toLowerCase()),
	station: hex(/^[0-9a-fA-F]{1,8}$/, "Expected a station ID (hex)").transform((s) => s.toUpperCase()),
	rssi: numeric(z.number()),
	snr: numeric(z.number()),
});

export type UplinkCallback = z.output<typeof uplinkCallbackSchema>;

export const invalidBodyResponseSchema = z.strictObject({
	error: z.literal("invalid_body"),
	issues: z.array(z.strictObject({ path: z.string(), message: z.string() })),
});

export type InvalidBodyResponse = z.infer<typeof invalidBodyResponseSchema>;

/** The exact text users paste into the Sigfox backend's custom callback body. */
export const UPLINK_BODY_TEMPLATE =
	'{"device":"{device}","time":{time},"seqNumber":{seqNumber},"data":"{data}","station":"{station}","rssi":{rssi},"snr":{snr}}';

export const UPLINK_CALLBACK_PATH = "/api/callbacks/sigfox/uplink";
