import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb } from "../../src/worker/db/client";
import { settings } from "../../src/worker/db/schema";

describe("D1 via drizzle", () => {
	it("reads and writes the settings table created by the migrations", async () => {
		const db = createDb(env.DB);

		await db.insert(settings).values({ key: "greeting", value: "hello" });
		const row = await db.select().from(settings).where(eq(settings.key, "greeting")).get();

		expect(row).toEqual({ key: "greeting", value: "hello" });
	});
});
