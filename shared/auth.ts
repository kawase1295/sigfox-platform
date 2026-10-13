import { z } from "zod";

export const meResponseSchema = z.strictObject({ email: z.email() });

export type MeResponse = z.infer<typeof meResponseSchema>;
