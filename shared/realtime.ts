import { z } from "zod";
import { deviceSchema, messageSchema } from "./devices";
import { locationSchema } from "./locations";

export const realtimeEventSchema = z.discriminatedUnion("type", [
	z.strictObject({ type: z.literal("message.upserted"), deviceId: z.string(), message: messageSchema }),
	z.strictObject({ type: z.literal("device.upserted"), device: deviceSchema }),
	z.strictObject({ type: z.literal("location.created"), location: locationSchema }),
]);

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
