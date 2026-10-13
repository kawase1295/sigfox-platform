import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { uplinkCallbackSchema } from "#shared/sigfox";
import { createDb } from "../../src/worker/db/client";
import { ingestUplink } from "../../src/worker/services/ingest-uplink";
import { randomHex } from "./helpers/api";

const input = (over: Record<string, unknown> = {}) =>
	uplinkCallbackSchema.parse({
		device: randomHex(6),
		time: 1_760_000_000,
		seqNumber: 1,
		data: "ff",
		station: "AAAA",
		rssi: -110,
		snr: 9,
		...over,
	});

describe("ingestUplink", () => {
	it("reports what changed so later hooks can react only to new data", async () => {
		const db = createDb(env.DB);
		const first = input();

		const created = await ingestUplink(db, first, new Date(1000));
		expect(created).toMatchObject({ created: true, changed: true, deviceCreated: true });

		const redelivered = await ingestUplink(db, first, new Date(2000));
		expect(redelivered).toMatchObject({ created: false, changed: false, deviceCreated: false });
		expect(redelivered.message.id).toBe(created.message.id);

		const otherStation = await ingestUplink(db, { ...first, station: "BBBB" }, new Date(3000));
		expect(otherStation).toMatchObject({ created: false, changed: true, deviceCreated: false });
		expect(otherStation.message.receptions).toHaveLength(2);
	});
});
