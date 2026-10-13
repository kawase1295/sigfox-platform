// Emits wrangler.jsonc solely for the Deploy to Cloudflare button / Workers Builds, which only read
// Wrangler config (see #4). cloudflare.config.ts stays the source of truth; scripts/check fails on drift.
import { writeFileSync } from "node:fs";
import { relative } from "node:path";
import { convertToWranglerConfig, loadAndParseConfig } from "@cloudflare/config";

// Client assets as written by `vite build` with @cloudflare/vite-plugin.
const ASSETS_DIR = ".cloudflare/output/v0/workers/default/assets";

const { result } = await loadAndParseConfig("cloudflare.config.ts", { isPreview: false, mode: "production" });
if (!result.success) throw result.error;

type WranglerConfig = {
	$schema?: string;
	name: string;
	main: string;
	assets?: Record<string, unknown>;
	d1_databases?: { migrations_dir?: string }[];
	durable_objects?: { bindings: { script_name?: string }[] };
};
const raw = convertToWranglerConfig(result.data) as unknown as WranglerConfig;
raw.$schema = "node_modules/wrangler/config-schema.json";
raw.main = relative(process.cwd(), raw.main);
raw.assets = { directory: ASSETS_DIR, ...raw.assets };
for (const d of raw.d1_databases ?? []) d.migrations_dir = "migrations";
// Why not keep script_name: a self-referencing DO binding makes wrangler look for a separate Worker.
for (const b of raw.durable_objects?.bindings ?? []) if (b.script_name === raw.name) delete b.script_name;

const out = `// GENERATED from cloudflare.config.ts by scripts/gen-wrangler.ts. Do not edit.\n${JSON.stringify(raw, null, "\t")}\n`;
writeFileSync(process.argv[2] ?? "wrangler.jsonc", out);
