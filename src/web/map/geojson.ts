import type { Location } from "#shared/locations";

// Minimal GeoJSON types; MapLibre accepts these structurally, and this module stays free of the big import.
type Point = { type: "Point"; coordinates: [number, number] };
type LineString = { type: "LineString"; coordinates: [number, number][] };
type Polygon = { type: "Polygon"; coordinates: [number, number][][] };
export type Feature<G = Point | LineString | Polygon> = {
	type: "Feature";
	id?: number;
	geometry: G;
	properties: Record<string, string | number | boolean | null>;
};
export type FeatureCollection<G = Point | LineString | Polygon> = { type: "FeatureCollection"; features: Feature<G>[] };

const collection = <G>(features: Feature<G>[]): FeatureCollection<G> => ({ type: "FeatureCollection", features });

const position = (l: Location): [number, number] => [l.lng, l.lat];

/** One point per location; `properties.id` lets a click find the location again. */
export const locationPoints = (locations: Location[], latestId?: number): FeatureCollection<Point> =>
	collection(
		locations.map((l) => ({
			type: "Feature",
			id: l.id,
			geometry: { type: "Point", coordinates: position(l) },
			properties: { id: l.id, source: l.source, latest: l.id === latestId },
		})),
	);

/** The path through a track, which must already be ordered oldest first. */
export const trackLine = (locations: Location[]): FeatureCollection<LineString> =>
	collection(
		locations.length < 2
			? []
			: [{ type: "Feature", geometry: { type: "LineString", coordinates: locations.map(position) }, properties: {} }],
	);

const EARTH_RADIUS_M = 6_371_008.8;

/** A geodesic circle approximated by `steps` vertices; good enough for an accuracy hint. */
export function circle(lng: number, lat: number, radiusM: number, steps = 48): Polygon {
	const d = radiusM / EARTH_RADIUS_M;
	const lat1 = (lat * Math.PI) / 180;
	const lng1 = (lng * Math.PI) / 180;
	const ring: [number, number][] = [];
	for (let i = 0; i <= steps; i++) {
		const bearing = (2 * Math.PI * (i % steps)) / steps;
		const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(bearing));
		const lng2 =
			lng1 +
			Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
		ring.push([(((lng2 * 180) / Math.PI + 540) % 360) - 180, (lat2 * 180) / Math.PI]);
	}
	return { type: "Polygon", coordinates: [ring] };
}

/** Accuracy areas of the given locations that report a radius. */
export const accuracyAreas = (locations: Location[]): FeatureCollection<Polygon> =>
	collection(
		locations
			.filter((l) => l.accuracy !== null && l.accuracy > 0)
			.map((l) => ({
				type: "Feature",
				id: l.id,
				geometry: circle(l.lng, l.lat, l.accuracy ?? 0),
				properties: { source: l.source },
			})),
	);

const METRES_PER_DEGREE_LAT = 111_320;

/**
 * [[west, south], [east, north]] around every location including its accuracy radius (so a lone Sigfox estimate
 * shows its whole area instead of a maximally zoomed dot), or null when there is nothing to frame.
 */
export function bounds(locations: Location[]): [[number, number], [number, number]] | null {
	if (locations.length === 0) return null;
	let [west, south, east, north] = [180, 90, -180, -90];
	for (const l of locations) {
		const dLat = (l.accuracy ?? 0) / METRES_PER_DEGREE_LAT;
		const dLng = dLat / Math.max(Math.cos((l.lat * Math.PI) / 180), 0.01);
		west = Math.min(west, l.lng - dLng);
		east = Math.max(east, l.lng + dLng);
		south = Math.max(-90, Math.min(south, l.lat - dLat));
		north = Math.min(90, Math.max(north, l.lat + dLat));
	}
	return [
		[west, south],
		[east, north],
	];
}
