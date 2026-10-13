import { describe, expect, it } from "vitest";
import { bounds, circle, trackLine } from "../../src/web/map/geojson";

describe("circle", () => {
	it("surrounds the centre at roughly the given radius", () => {
		const ring = circle(139.7, 35.6, 1000).coordinates[0] ?? [];
		expect(ring.at(0)).toEqual(ring.at(-1));
		const [lng, lat] = ring[0] ?? [0, 0];
		// The first vertex is due north: 1 km is about 0.009 degrees of latitude.
		expect(lng).toBeCloseTo(139.7, 6);
		expect(lat - 35.6).toBeCloseTo(0.009, 3);
	});
});

describe("trackLine and bounds", () => {
	const at = (id: number, lat: number, lng: number) => ({
		id,
		deviceId: "A",
		messageId: id,
		time: "2026-10-01T00:00:00.000Z",
		lat,
		lng,
		accuracy: null,
		source: "gps" as const,
	});

	it("needs two points for a line", () => {
		expect(trackLine([at(1, 1, 1)]).features).toEqual([]);
		expect(trackLine([at(1, 1, 1), at(2, 2, 3)]).features[0]?.geometry.coordinates).toEqual([
			[1, 1],
			[3, 2],
		]);
	});

	it("includes the accuracy radius", () => {
		const [[west, south], [east, north]] = bounds([{ ...at(1, 0, 10), accuracy: 111_320 }]) ?? [[], []];
		expect([west, south, east, north].map((n) => Math.round(n ?? Number.NaN))).toEqual([9, -1, 11, 1]);
	});

	it("frames all points", () => {
		expect(bounds([])).toBeNull();
		expect(bounds([at(1, -5, 10), at(2, 5, -10)])).toEqual([
			[-10, -5],
			[10, 5],
		]);
	});
});
