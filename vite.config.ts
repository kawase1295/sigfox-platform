import { cloudflare } from "@cloudflare/vite-plugin";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Vitest config lives here because vitest.config.* files are off-limits in this repo's tooling.
export default defineConfig(async () => {
	// Why not one plugin list: the dev/build plugin and the test pool both try to own the Worker runtime.
	if (!process.env.VITEST) return { plugins: [react(), cloudflare()] };
	return {
		test: {
			projects: [
				{
					plugins: [
						cloudflareTest({
							experimental: { newConfig: true },
							miniflare: {
								bindings: {
									TEST_MIGRATIONS: await readD1Migrations("./migrations"),
									// Lets integration tests call the default export as the dev user; Access paths inject their own env.
									AUTH_DEV_BYPASS: "1",
								},
								// Why redeclared: the pool keeps the self-referencing worker name of the binding and then
								// cannot resolve it (workers-sdk#16012). Drop once that issue is fixed.
								durableObjects: { REALTIME: { className: "RealtimeHub", useSQLite: true } },
							},
						}),
					],
					test: { name: "worker", include: ["test/worker/**/*.test.ts"], setupFiles: ["./test/apply-migrations.ts"] },
				},
				{
					plugins: [react()],
					test: { name: "web", include: ["test/web/**/*.test.{ts,tsx}"], environment: "happy-dom" },
				},
			],
		},
	};
});
