import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import type { CreateParserRequest } from "#shared/parsers";
import { createParser, listParserSamples, listParsers } from "../api/client";
import { formatDateTime } from "../format";
import { useI18n } from "../i18n";

const BLANK_PARSER = `// payload: the frame as lowercase hex. lastParsedPayload: the previous message's output ([] if none).
// Return a list of { key, value, type, unit }.
var temperature = parseInt(payload.slice(0, 4), 16) / 10;
return [{ key: "temperature", value: temperature, type: "number", unit: "°C" }];
`;

export function ParsersPage() {
	const { t, locale } = useI18n();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const parsers = useQuery({ queryKey: ["parsers"], queryFn: listParsers });
	const samples = useQuery({ queryKey: ["parsers", "samples"], queryFn: listParserSamples, staleTime: Infinity });
	const create = useMutation({
		mutationFn: (body: CreateParserRequest) => createParser(body),
		onSuccess: async (parser) => {
			await queryClient.invalidateQueries({ queryKey: ["parsers"], exact: true });
			await navigate({ to: "/parsers/$parserId", params: { parserId: parser.id } });
		},
	});

	const fromSample = (id: string) => {
		const sample = samples.data?.find((s) => s.id === id);
		if (sample) create.mutate({ name: sample.name, code: sample.code });
	};

	return (
		<section className="section">
			<header className="stack">
				<h1 className="heading-32">{t("parsers.heading")}</h1>
				<p className="copy-14 secondary">{t("parsers.body")}</p>
			</header>

			<div className="inline-form">
				<button
					type="button"
					className="button primary"
					disabled={create.isPending}
					onClick={() => create.mutate({ name: t("parsers.untitled"), code: BLANK_PARSER })}
				>
					{t("parsers.create")}
				</button>
				<label className="field">
					<span className="label-13">{t("parsers.fromSample")}</span>
					<select
						className="input"
						value=""
						disabled={create.isPending || !samples.data}
						onChange={(e) => fromSample(e.target.value)}
					>
						<option value="">{t("parsers.chooseSample")}</option>
						{samples.data?.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</select>
				</label>
			</div>
			{create.isError && (
				<p className="copy-14 error" role="alert">
					{t("parsers.createError")}
				</p>
			)}

			{parsers.isPending ? (
				<p className="copy-14 secondary">{t("common.loading")}</p>
			) : parsers.isError ? (
				<p className="copy-14 error" role="alert">
					{t("parsers.loadError")}
				</p>
			) : parsers.data.length === 0 ? (
				<div className="empty">
					<p className="copy-14 secondary">{t("parsers.empty")}</p>
				</div>
			) : (
				<div className="table-wrap">
					<table className="table">
						<thead>
							<tr>
								<th>{t("parsers.name")}</th>
								<th className="numeric">{t("parsers.devices")}</th>
								<th>{t("parsers.updatedAt")}</th>
							</tr>
						</thead>
						<tbody>
							{parsers.data.map((p) => (
								<tr key={p.id}>
									<td>
										<Link to="/parsers/$parserId" params={{ parserId: p.id }} className="link">
											{p.name}
										</Link>
									</td>
									<td className="mono numeric">{p.deviceCount}</td>
									<td className="mono">{formatDateTime(p.updatedAt, locale)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</section>
	);
}
