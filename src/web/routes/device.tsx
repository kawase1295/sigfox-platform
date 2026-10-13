import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import type { Message } from "#shared/devices";
import { getDevice, listMessages, listParsers, listTrack, updateDevice } from "../api/client";
import { locationLines, MapPanel } from "../components/map-panel";
import { ParsedValues } from "../components/parsed-values";
import { formatDateTime } from "../format";
import { useI18n } from "../i18n";

const bestRssi = (m: Message) => (m.receptions.length ? Math.max(...m.receptions.map((r) => r.rssi)) : null);

export function DevicePage({ deviceId }: { deviceId: string }) {
	const { t, locale } = useI18n();
	const device = useQuery({ queryKey: ["devices", deviceId], queryFn: () => getDevice(deviceId) });
	const messages = useInfiniteQuery({
		queryKey: ["devices", deviceId, "messages"],
		queryFn: ({ pageParam }) => listMessages(deviceId, pageParam),
		initialPageParam: null as string | null,
		getNextPageParam: (last) => last.nextCursor,
	});
	const rows = messages.data?.pages.flatMap((p) => p.messages) ?? [];
	const track = useQuery({ queryKey: ["devices", deviceId, "locations"], queryFn: () => listTrack(deviceId) });

	return (
		<section className="section">
			<header className="stack">
				<Link to="/" className="label-13 secondary link">
					{t("device.back")}
				</Link>
				<h1 className="heading-32">{device.data?.name ?? deviceId}</h1>
				<p className="mono secondary">{deviceId}</p>
			</header>

			{device.isError && (
				<p className="copy-14 error" role="alert">
					{t("device.loadError")}
				</p>
			)}
			{device.data && <RenameForm deviceId={deviceId} name={device.data.name} />}
			{device.data && <ParserSelect deviceId={deviceId} parserId={device.data.parserId} />}

			<h2 className="heading-20">{t("device.locations")}</h2>
			{track.isPending ? (
				<p className="copy-14 secondary">{t("common.loading")}</p>
			) : track.isError ? (
				<p className="copy-14 error" role="alert">
					{t("device.locationsError")}
				</p>
			) : track.data.length === 0 ? (
				<p className="copy-14 secondary">{t("device.noLocations")}</p>
			) : (
				<MapPanel
					locations={track.data}
					mode="track"
					label={t("map.trackLabel")}
					describe={(l) => {
						const [time = "", ...rest] = locationLines(l, t, locale);
						return { title: time, lines: rest };
					}}
				/>
			)}

			<h2 className="heading-20">{t("device.messages")}</h2>
			{messages.isPending ? (
				<p className="copy-14 secondary">{t("common.loading")}</p>
			) : messages.isError && rows.length === 0 ? (
				<p className="copy-14 error" role="alert">
					{t("device.messagesError")}
				</p>
			) : rows.length === 0 ? (
				<p className="copy-14 secondary">{t("device.noMessages")}</p>
			) : (
				<>
					<div className="table-wrap">
						<table className="table">
							<thead>
								<tr>
									<th>{t("device.time")}</th>
									<th className="numeric">{t("device.seq")}</th>
									<th>{t("device.data")}</th>
									<th className="numeric">{t("device.stations")}</th>
									<th className="numeric">{t("device.bestRssi")}</th>
									<th>{t("device.parsed")}</th>
								</tr>
							</thead>
							<tbody>
								{rows.map((m) => (
									<tr key={m.id}>
										<td className="mono">{formatDateTime(m.time, locale)}</td>
										<td className="mono numeric">{m.seqNumber}</td>
										<td className="mono">{m.data || "—"}</td>
										<td className="mono numeric">{m.receptions.length}</td>
										<td className="mono numeric">{bestRssi(m)?.toFixed(1) ?? "—"}</td>
										<td>
											<ParsedValues message={m} />
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{messages.hasNextPage && (
						<button
							type="button"
							className="button secondary load-more"
							disabled={messages.isFetchingNextPage}
							onClick={() => messages.fetchNextPage()}
						>
							{messages.isFetchingNextPage ? t("common.loading") : t("device.loadMore")}
						</button>
					)}
				</>
			)}
		</section>
	);
}

function RenameForm({ deviceId, name }: { deviceId: string; name: string | null }) {
	const { t } = useI18n();
	const queryClient = useQueryClient();
	const [value, setValue] = useState(name ?? "");
	const rename = useMutation({
		mutationFn: (next: string) => updateDevice(deviceId, { name: next }),
		onSuccess: (updated) => {
			queryClient.setQueryData(["devices", deviceId], updated);
			return queryClient.invalidateQueries({ queryKey: ["devices"], exact: true });
		},
	});
	const onSubmit = (e: FormEvent) => {
		e.preventDefault();
		rename.mutate(value);
	};

	return (
		<form className="inline-form" onSubmit={onSubmit}>
			<label className="field">
				<span className="label-13">{t("devices.name")}</span>
				<input
					className="input"
					value={value}
					maxLength={100}
					placeholder={t("device.namePlaceholder")}
					onChange={(e) => setValue(e.target.value)}
				/>
			</label>
			<button type="submit" className="button secondary" disabled={rename.isPending || value.trim() === (name ?? "")}>
				{rename.isPending ? t("device.saving") : t("device.saveName")}
			</button>
			{rename.isError && (
				<p className="copy-14 error" role="alert">
					{t("device.saveError")}
				</p>
			)}
		</form>
	);
}

function ParserSelect({ deviceId, parserId }: { deviceId: string; parserId: string | null }) {
	const { t } = useI18n();
	const queryClient = useQueryClient();
	const parsers = useQuery({ queryKey: ["parsers"], queryFn: listParsers });
	const assign = useMutation({
		mutationFn: (next: string | null) => updateDevice(deviceId, { parserId: next }),
		onSuccess: (updated) => {
			queryClient.setQueryData(["devices", deviceId], updated);
			return queryClient.invalidateQueries({ queryKey: ["parsers"], exact: true });
		},
	});

	return (
		<div className="inline-form">
			<label className="field">
				<span className="label-13">{t("device.parser")}</span>
				<select
					className="input"
					value={parserId ?? ""}
					disabled={assign.isPending || !parsers.data}
					onChange={(e) => assign.mutate(e.target.value || null)}
				>
					<option value="">{t("device.noParser")}</option>
					{parsers.data?.map((p) => (
						<option key={p.id} value={p.id}>
							{p.name}
						</option>
					))}
				</select>
			</label>
			<p className="copy-13 secondary">{t("device.parserHint")}</p>
			{assign.isError && (
				<p className="copy-14 error" role="alert">
					{t("device.parserError")}
				</p>
			)}
		</div>
	);
}
