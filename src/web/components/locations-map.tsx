import "maplibre-gl/dist/maplibre-gl.css";
import {
	type GeoJSONSource,
	type MapLayerMouseEvent,
	Map as MapLibreMap,
	NavigationControl,
	Popup,
	setWorkerUrl,
} from "maplibre-gl";
// Why explicit: maplibre-gl 6 builds its worker URL at runtime, which Vite cannot see, so the bundle would lack it.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import { useEffect, useRef, useState } from "react";
import type { FeatureCollection } from "../map/geojson";

setWorkerUrl(workerUrl);

export type PopupContent = { title: string; lines: string[] };

export type LocationsMapProps = {
	styleUrl: string;
	label: string;
	points: FeatureCollection;
	line: FeatureCollection;
	areas: FeatureCollection;
	/** Group nearby points; for overviews with many devices. */
	cluster: boolean;
	bounds: [[number, number], [number, number]] | null;
	describe: (id: number) => PopupContent | null;
};

// MapLibre paints with literal colours, not CSS variables: Geist blue-700 (GPS) and purple-700 (Sigfox).
const SOURCE_COLOR = ["match", ["get", "source"], "gps", "#006bff", "#8e4ec6"] as const;
const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

function addLayers(map: MapLibreMap, cluster: boolean) {
	map.addSource("areas", { type: "geojson", data: EMPTY });
	map.addSource("line", { type: "geojson", data: EMPTY });
	map.addSource("points", { type: "geojson", data: EMPTY, cluster, clusterRadius: 40 });
	map.addLayer({
		id: "areas",
		type: "fill",
		source: "areas",
		paint: { "fill-color": SOURCE_COLOR as never, "fill-opacity": 0.08, "fill-outline-color": SOURCE_COLOR as never },
	});
	map.addLayer({
		id: "line",
		type: "line",
		source: "line",
		layout: { "line-join": "round", "line-cap": "round" },
		paint: { "line-color": "#171717", "line-width": 2, "line-opacity": 0.6 },
	});
	map.addLayer({
		id: "clusters",
		type: "circle",
		source: "points",
		filter: ["has", "point_count"],
		paint: {
			"circle-color": "#171717",
			"circle-radius": 14,
			"circle-stroke-color": "#ffffff",
			"circle-stroke-width": 2,
		},
	});
	map.addLayer({
		id: "cluster-count",
		type: "symbol",
		source: "points",
		filter: ["has", "point_count"],
		// Why Noto Sans: the font OpenFreeMap styles ship glyphs for; a custom style needs the same font to label.
		layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Regular"], "text-size": 12 },
		paint: { "text-color": "#ffffff" },
	});
	map.addLayer({
		id: "points",
		type: "circle",
		source: "points",
		filter: ["!", ["has", "point_count"]],
		paint: {
			"circle-color": SOURCE_COLOR as never,
			"circle-radius": ["case", ["boolean", ["get", "latest"], false], 8, 5],
			"circle-stroke-color": "#ffffff",
			"circle-stroke-width": 2,
		},
	});
}

function popupNode({ title, lines }: PopupContent): HTMLElement {
	// Why DOM nodes instead of setHTML: device names are user input.
	const root = document.createElement("div");
	root.className = "map-popup";
	const heading = document.createElement("strong");
	heading.textContent = title;
	root.append(heading, ...lines.map((line) => Object.assign(document.createElement("div"), { textContent: line })));
	return root;
}

/** MapLibre map of location points; loaded lazily because maplibre-gl is the largest chunk of the SPA. */
export default function LocationsMap(props: LocationsMapProps) {
	const { styleUrl, label, points, line, areas, cluster, bounds } = props;
	const container = useRef<HTMLElement>(null);
	const [map, setMap] = useState<MapLibreMap | null>(null);
	// Read at click time, so a re-render with fresh data never needs to rebind handlers.
	const describe = useRef(props.describe);
	describe.current = props.describe;

	useEffect(() => {
		if (!container.current) return;
		const instance = new MapLibreMap({ container: container.current, style: styleUrl, center: [0, 20], zoom: 1 });
		instance.addControl(new NavigationControl({ showCompass: false }));
		instance.on("load", () => {
			addLayers(instance, cluster);
			instance.on("click", "points", (e: MapLayerMouseEvent) => {
				const feature = e.features?.[0];
				const content = describe.current(Number(feature?.properties?.id));
				if (!feature || !content) return;
				new Popup({ offset: 12 }).setLngLat(e.lngLat).setDOMContent(popupNode(content)).addTo(instance);
			});
			instance.on("click", "clusters", async (e: MapLayerMouseEvent) => {
				const feature = e.features?.[0];
				const source = instance.getSource<GeoJSONSource>("points");
				if (!feature || !source || feature.geometry.type !== "Point") return;
				const zoom = await source.getClusterExpansionZoom(Number(feature.properties?.cluster_id));
				instance.easeTo({ center: feature.geometry.coordinates as [number, number], zoom });
			});
			for (const layer of ["points", "clusters"]) {
				instance.on("mouseenter", layer, () => {
					instance.getCanvas().style.cursor = "pointer";
				});
				instance.on("mouseleave", layer, () => {
					instance.getCanvas().style.cursor = "";
				});
			}
			setMap(instance);
		});
		return () => {
			setMap(null);
			instance.remove();
		};
	}, [styleUrl, cluster]);

	useEffect(() => {
		if (!map) return;
		map.getSource<GeoJSONSource>("points")?.setData(points as never);
		map.getSource<GeoJSONSource>("line")?.setData(line as never);
		map.getSource<GeoJSONSource>("areas")?.setData(areas as never);
	}, [map, points, line, areas]);

	// Frame the data once; realtime points arriving later must not yank the view away from the user.
	const framed = useRef(false);
	useEffect(() => {
		if (!map || !bounds || framed.current) return;
		framed.current = true;
		map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 0 });
	}, [map, bounds]);

	return <section ref={container} className="map" aria-label={label} />;
}
