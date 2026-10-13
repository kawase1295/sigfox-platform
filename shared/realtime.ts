import { z } from "zod";
import { deviceSchema, messageSchema } from "./devices";

// Why defined here before #9: the realtime contract is shared, so #9 extends this shape instead of inventing one.
export const locationSchema = z.strictObject({
	deviceId: z.string(),
	time: z.iso.datetime(),
	lat: z.number().min(-90).max(90),
	lng: z.number().min(-180).max(180),
	/** Radius in metres when the source reports one (Sigfox computedLocation). */
	accuracy: z.number().nonnegative().optional(),
	source: z.enum(["parser", "sigfox"]),
});

export const realtimeEventSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("message.upserted"), deviceId: z.string(), message: messageSchema }),
	z.strictObject({ type: z.literal("device.upserted"), device: deviceSchema }),
	z.strictObject({ type: z.literal("location.created"), location: locationSchema }),
]);

export type Location = z.infer<typeof locationSchema>;
export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
