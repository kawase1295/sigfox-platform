import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };

// Why not omit the id everywhere: `cf d1 migrations --local` only accepts a UUID (cloudflare/cf#38).
// Why not set it everywhere: a deploy would bind a database that does not exist in the deployer's account.
export const LOCAL_D1_ID = "00000000-0000-4000-8000-000000000001";

export default defineConfig(({ mode }) => ({
	worker: {
		name: "sigfox-platform",
		compatibilityDate: "2026-10-06",
		entrypoint,
		assets: { notFoundHandling: "single-page-application", runWorkerFirst: ["/api/*"] },
		env: {
			DB: bindings.d1({ name: "sigfox-platform-db", id: mode === "production" ? undefined : LOCAL_D1_ID }),
			ASSETS: bindings.assets(),
		},
	},
}));
