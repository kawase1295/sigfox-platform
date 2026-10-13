import type { UplinkCallback } from "#shared/sigfox";
import type { Db } from "../db/client";
import { type IngestResult, ingestFrame } from "./ingest";

export type { IngestResult } from "./ingest";

/** Stores one DATA/UPLINK reception: the frame as heard by a single station. */
export function ingestUplink(db: Db, input: UplinkCallback, now = new Date()): Promise<IngestResult> {
	const { station, rssi, snr, ...frame } = input;
	return ingestFrame(db, { ...frame, receptions: [{ station, rssi, snr, source: "uplink" }] }, now);
}
