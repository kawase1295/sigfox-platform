import { defineConfig } from "drizzle-kit";

// Why not drizzle-kit migrate/push: migrations are applied with `cf d1 migrations` (local) and wrangler (Deploy button).
export default defineConfig({
	dialect: "sqlite",
	schema: "./src/worker/db/schema.ts",
	out: "./migrations",
});
