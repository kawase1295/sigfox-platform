import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo } from "react";
import type { Location } from "#shared/locations";
import { fetchConfig } from "../api/client";
import { formatDateTime } from "../format";
import { useI18n } from "../i18n";
import type { MessageKey } from "../i18n/en";
import { accuracyAreas, bounds, type FeatureCollection, locationPoints, trackLine } from "../map/geojson";
import type { PopupContent } from "./locations-map";

/** Popup lines shared by both maps: when, and how the position was obtained. */
export function locationLines(location: Location, t: (key: MessageKey) => string, locale: string): string[] {
	const source = t(location.source === "gps" ? "map.source.gps" : "map.source.sigfox");
	const accuracy =
		location.accuracy === null ? "" : ` ±${new Intl.NumberFormat(locale).format(Math.round(location.accuracy))} m`;
	return [formatDateTime(location.time, locale), `${source}${accuracy}`];
}

const LocationsMap = lazy(() => import("./locations-map"));

const EMPTY: FeatureCollection = { type: "FeatureCollection", features: [] };

type MapPanelProps = {
	locations: Location[];
	/** `latest`: one clustered point per device. `track`: one device's path, oldest first, with accuracy areas. */
	mode: "latest" | "track";
	label: string;
	describe: (location: Location) => PopupContent;
};

export function MapPanel({ locations, mode, label, describe }: MapPanelProps) {
	const { t } = useI18n();
	// Why staleTime Infinity: the style URL is a deploy-time setting.
	const config = useQuery({ queryKey: ["config"], queryFn: fetchConfig, staleTime: Number.POSITIVE_INFINITY });
	const data = useMemo(() => {
		const track = mode === "track";
		return {
			points: locationPoints(locations, track ? locations.at(-1)?.id : undefined),
			line: track ? trackLine(locations) : EMPTY,
			areas: track ? accuracyAreas(locations) : EMPTY,
			bounds: bounds(locations),
			byId: new Map(locations.map((l) => [l.id, l])),
		};
	}, [locations, mode]);

	if (config.isError)
		return (
			<p className="copy-14 error" role="alert">
				{t("map.error")}
			</p>
		);
	const loading = <p className="map map-placeholder copy-14 secondary">{t("map.loading")}</p>;
	if (!config.data) return loading;
	return (
		<Suspense fallback={loading}>
			<LocationsMap
				styleUrl={config.data.mapStyleUrl}
				label={label}
				points={data.points}
				line={data.line}
				areas={data.areas}
				cluster={mode === "latest"}
				bounds={data.bounds}
				describe={(id) => {
					const location = data.byId.get(id);
					return location ? describe(location) : null;
				}}
			/>
		</Suspense>
	);
}
