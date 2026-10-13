import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { listDevices } from "../api/client";
import { formatDateTime } from "../format";
import { useI18n } from "../i18n";

export function DevicesPage() {
	const { t, locale } = useI18n();
	const devices = useQuery({ queryKey: ["devices"], queryFn: listDevices });

	return (
		<section className="section">
			<header className="stack">
				<h1 className="heading-32">{t("devices.heading")}</h1>
				<p className="copy-14 secondary">{t("devices.body")}</p>
			</header>

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
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
