import { z } from "zod";

/** `sigfox`: DATA_ADVANCED computedLocation (Atlas). `gps`: `lat`/`lng` values from the device's parser. */
export const locationSourceSchema = z.enum(["sigfox", "gps"]);

export const locationSchema = z.strictObject({
	id: z.number().int(),
	deviceId: z.string(),
	messageId: z.number().int(),
	/** Sigfox time of the message the position came from. */
	time: z.iso.datetime(),
	lat: z.number().min(-90).max(90),
	lng: z.number().min(-180).max(180),
	/** Radius in metres when the source reports one (Sigfox computedLocation, or a parser `accuracy` value). */
	accuracy: z.number().nonnegative().nullable(),
	source: locationSourceSchema,
});

export const locationListSchema = z.strictObject({ locations: z.array(locationSchema) });

export const TRACK_LIMIT_DEFAULT = 500;
export const TRACK_LIMIT_MAX = 5000;

/** The newest `limit` positions within [from, to], returned oldest first so they draw as a line. */
export const trackQuerySchema = z
	.object({
		from: z.iso.datetime().optional(),
		to: z.iso.datetime().optional(),
		limit: z.coerce.number().int().min(1).max(TRACK_LIMIT_MAX).default(TRACK_LIMIT_DEFAULT),
	})
	.refine((q) => !q.from || !q.to || q.from <= q.to, "from must not be after to");

export type LocationSource = z.infer<typeof locationSourceSchema>;
export type Location = z.infer<typeof locationSchema>;
export type LocationList = z.infer<typeof locationListSchema>;
