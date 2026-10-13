import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import type { Message } from "#shared/devices";
import { getDevice, listMessages, updateDevice } from "../api/client";
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
