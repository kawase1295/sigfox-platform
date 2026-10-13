import { bindings, defineConfig, exports, triggers } from "cf/config";
import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };

// Why not omit the id everywhere: `cf d1 migrations --local` only accepts a UUID (cloudflare/cf#38).
// Why not set it everywhere: a deploy would bind a database that does not exist in the deployer's account.
export const LOCAL_D1_ID = "00000000-0000-4000-8000-000000000001";

// Why mode-dependent: only declared secrets receive .dev.vars values locally, and the dev bypass must not even be
// declared for production. Access settings are required there so a deploy cannot silently run unauthenticated.
type AuthSecrets = Partial<
	Record<"ACCESS_TEAM_DOMAIN" | "ACCESS_AUD" | "AUTH_DEV_BYPASS", ReturnType<typeof bindings.secret>>
>;
const authEnv = (mode: string | undefined): AuthSecrets =>
	mode === "production"
		? { ACCESS_TEAM_DOMAIN: bindings.secret(), ACCESS_AUD: bindings.secret() }
		: { AUTH_DEV_BYPASS: bindings.secret() };

export default defineConfig(({ mode }) => ({
	worker: {
		name: "sigfox-platform",
		compatibilityDate: "2026-10-06",
		entrypoint,
		exports: { RealtimeHub: exports.durableObject({ storage: "sqlite" }) },
		assets: { notFoundHandling: "single-page-application", runWorkerFirst: ["/api/*"] },
		env: {
			DB: bindings.d1({ name: "sigfox-platform-db", id: mode === "production" ? undefined : LOCAL_D1_ID }),
			ASSETS: bindings.assets(),
			// Days of messages to keep; "0" keeps everything. A plain var so the Deploy button and dashboard can edit it.
			RETENTION_DAYS: bindings.text<string>("365"),
			// MapLibre style for every map; any style JSON URL works (default: OpenFreeMap, no API key).
			MAP_STYLE_URL: bindings.text<string>("https://tiles.openfreemap.org/styles/liberty"),
			REALTIME: bindings.durableObject({ worker: "sigfox-platform", exportName: "RealtimeHub" }),
			...authEnv(mode),
		},
		// Daily retention purge (src/worker/services/retention.ts), off-peak UTC.
		triggers: [triggers.scheduled({ schedule: "0 3 * * *" })],
	},
}));
