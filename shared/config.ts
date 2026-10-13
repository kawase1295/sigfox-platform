import { z } from "zod";

/** No API key and no usage limits, which keeps "Deploy to Cloudflare" a one-click setup. */
export const DEFAULT_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** Runtime settings the SPA needs from the deployment. */
export const configResponseSchema = z.strictObject({ mapStyleUrl: z.url() });

export type ConfigResponse = z.infer<typeof configResponseSchema>;
