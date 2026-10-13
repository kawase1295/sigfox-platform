import type { AdvancedCallback } from "#shared/sigfox";
import type { Db } from "../db/client";
import { type IngestResult, ingestFrame } from "./ingest";

/**
 * Stores one DATA_ADVANCED callback. Sigfox may send it before, after or instead of DATA/UPLINK, so it creates the
 * message when missing and otherwise adds lqi and the per-station repetitions from `duplicates`.
 */
export function ingestAdvanced(db: Db, input: AdvancedCallback, now = new Date()): Promise<IngestResult> {
	const { duplicates, computedLocation: _, ...frame } = input;
	const receptions = (duplicates ?? []).map((d) => ({
		station: d.bsId,
		rssi: d.rssi,
		snr: d.snr,
		nbRep: d.nbRep,
		source: "advanced" as const,
	}));
	return ingestFrame(db, { ...frame, receptions }, now);
}
