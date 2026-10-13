import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { communicationLost } from "#shared/devices";
import { listDevices, listLatestLocations } from "../api/client";
import { locationLines, MapPanel } from "../components/map-panel";
import { formatDateTime } from "../format";
import { useI18n } from "../i18n";

export function DevicesPage() {
	const { t, locale } = useI18n();
	const devices = useQuery({ queryKey: ["devices"], queryFn: listDevices });
	const latest = useQuery({ queryKey: ["locations", "latest"], queryFn: listLatestLocations });
	const nameOf = (id: string) => devices.data?.find((d) => d.id === id)?.name ?? id;

	return (
		<section className="section">
			<header className="stack">
				<h1 className="heading-32">{t("devices.heading")}</h1>
				<p className="copy-14 secondary">{t("devices.body")}</p>
			</header>

			{latest.data && latest.data.length > 0 && (
				<MapPanel
					locations={latest.data}
					mode="latest"
					label={t("map.latestLabel")}
					describe={(l) => ({ title: nameOf(l.deviceId), lines: locationLines(l, t, locale) })}
				/>
			)}

			{devices.isPending ? (
				<p className="copy-14 secondary">{t("common.loading")}</p>
			) : devices.isError ? (
				<p className="copy-14 error" role="alert">
					{t("devices.loadError")}
				</p>
			) : devices.data.length === 0 ? (
				<div className="empty">
					<p className="copy-14 secondary">{t("devices.empty")}</p>
					<Link to="/settings/callback" className="button primary">
						{t("devices.setUpCallback")}
					</Link>
				</div>
			) : (
				<div className="table-wrap">
					<table className="table">
						<thead>
							<tr>
								<th>{t("devices.id")}</th>
								<th>{t("devices.name")}</th>
								<th>{t("devices.lastMessageAt")}</th>
								<th className="numeric">{t("devices.messageCount")}</th>
								<th>{t("devices.status")}</th>
							</tr>
						</thead>
						<tbody>
							{devices.data.map((device) => (
								<tr key={device.id}>
									<td>
										<Link to="/devices/$deviceId" params={{ deviceId: device.id }} className="mono link">
											{device.id}
										</Link>
									</td>
									<td>{device.name ?? "—"}</td>
									<td className="mono">{formatDateTime(device.lastMessageAt, locale)}</td>
									<td className="mono numeric">{device.messageCount}</td>
									<td>
										{communicationLost(device) ? (
											<span className="badge" data-state="error">
												{t("device.communicationLost")}
											</span>
										) : (
											"—"
										)}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
