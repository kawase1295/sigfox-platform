import { Hono } from "hono";
import type { HealthResponse } from "#shared/health";

export const app = new Hono<{ Bindings: Env }>().basePath("/api");

app.get("/health", (c) => c.json({ status: "ok" } satisfies HealthResponse));

app.notFound((c) => c.json({ error: "not_found" }, 404));
